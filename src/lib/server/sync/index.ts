/**
 * D1 -> Shopify sync orchestration.
 *
 * planSync (read-only): find locally-changed rows, ask Shopify for each one's
 * current updatedAt, and run decideSync. Safe to run against production.
 *
 * applySync: execute the plan. Only `push` decisions mutate Shopify, and only
 * after the per-row conflict guard passed. Metaobjects (authors/pages) are
 * implemented; product/variant pushes are logged as unsupported for now.
 * Every outcome is written to sync_log.
 */
import { eq } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { decideSync, isDirty, type SyncDecision, type SyncState } from './conflict';
import type { MetaobjectWrite, ShopifyGateway, SyncEntityType } from './gateway';
import {
	hashFields,
	metaobjectManagedFields,
	productManagedFields,
	variantManagedFields
} from './fields';

export type { ShopifyGateway } from './gateway';
export { createShopifyGateway } from './gateway';

export interface PlanEntry {
	type: SyncEntityType;
	id: number | string;
	shopifyId: string | null;
	title: string | null;
	decision: SyncDecision;
}

export interface ApplyEntry extends PlanEntry {
	applied: boolean;
	error?: string;
}

/**
 * The import stored product shopify_id as a bare numeric id, while variants and
 * metaobjects store full gids. The Admin API needs a gid, so normalize products.
 */
function productGid(shopifyId: string): string {
	return shopifyId.startsWith('gid://') ? shopifyId : `gid://shopify/Product/${shopifyId}`;
}

function stateOf(row: {
	updatedAt: string;
	lastSyncedAt: string | null;
	shopifyUpdatedAt: string | null;
}): SyncState {
	return {
		updatedAt: row.updatedAt,
		lastSyncedAt: row.lastSyncedAt,
		shopifyUpdatedAt: row.shopifyUpdatedAt
	};
}

/** Map a metaobject row's JSON fields to Shopify's [{key,value}] write shape */
export function metaobjectToWrite(row: typeof schema.metaobject.$inferSelect): MetaobjectWrite {
	const fields: { key: string; value: string }[] = [];
	for (const [key, raw] of Object.entries(row.fields ?? {})) {
		if (raw === null || raw === undefined) continue; // omit empties (don't clear refs)
		const value =
			typeof raw === 'string' ? raw : Array.isArray(raw) || typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
		fields.push({ key, value });
	}
	return {
		handle: row.handle,
		status: row.status === 'Active' ? 'ACTIVE' : 'DRAFT',
		fields
	};
}

/** Rows of a type that have local edits to push (dirty), with sync state */
async function dirtyMetaobjects(db: DbClient) {
	const rows = await db.query.metaobject.findMany();
	return rows.filter((r) => r.shopifyId && isDirty(stateOf(r)));
}

async function dirtyProducts(db: DbClient) {
	const rows = await db.select().from(schema.product);
	return rows.filter((r) => r.shopifyId && isDirty(stateOf(r)));
}

async function dirtyVariants(db: DbClient) {
	const rows = await db.select().from(schema.variant);
	return rows.filter((r) => isDirty(stateOf(r)));
}

/** Optional targeting so a first production push can be a single record */
export interface SyncFilter {
	type?: SyncEntityType;
	/** Local row id (number for product/metaobject, variant gid for variant) */
	id?: number | string;
}

const wants = (filter: SyncFilter | undefined, type: SyncEntityType, id: number | string) =>
	(!filter?.type || filter.type === type) && (filter?.id === undefined || String(filter.id) === String(id));

/**
 * Decide for one row: timestamp check first, then — when that yields a conflict
 * and we have a base field hash — refine by comparing Shopify's current managed
 * fields. If those match the base, the `updatedAt` bump was unrelated to fields
 * we manage (a false positive) and we downgrade to a push.
 */
async function decideRow(
	gateway: ShopifyGateway,
	type: SyncEntityType,
	gid: string,
	state: SyncState,
	fieldHash: string | null
): Promise<SyncDecision> {
	const remoteUpdatedAt = await gateway.getUpdatedAt(type, gid);
	const decision = decideSync(state, remoteUpdatedAt);
	if (decision.action === 'conflict' && fieldHash) {
		const remoteFields = await gateway.getFields(type, gid);
		if (remoteFields && hashFields(remoteFields) === fieldHash) {
			return { action: 'push' };
		}
	}
	return decision;
}

export interface DirtyRow {
	type: SyncEntityType;
	id: number | string;
	title: string | null;
	updatedAt: string;
	lastSyncedAt: string | null;
}

/** Local-only list of rows with unpushed local edits (no Shopify calls). */
export async function listDirty(db: DbClient): Promise<DirtyRow[]> {
	const out: DirtyRow[] = [];
	for (const r of await dirtyMetaobjects(db))
		out.push({ type: 'metaobject', id: r.id, title: r.title, updatedAt: r.updatedAt, lastSyncedAt: r.lastSyncedAt });
	for (const r of await dirtyProducts(db))
		out.push({ type: 'product', id: r.id, title: r.title, updatedAt: r.updatedAt, lastSyncedAt: r.lastSyncedAt });
	for (const r of await dirtyVariants(db))
		out.push({ type: 'variant', id: r.id, title: r.title, updatedAt: r.updatedAt, lastSyncedAt: r.lastSyncedAt });
	return out;
}

/** Read-only: compute what sync would do for every dirty row (optionally filtered). */
export async function planSync(
	db: DbClient,
	gateway: ShopifyGateway,
	filter?: SyncFilter
): Promise<PlanEntry[]> {
	const plan: PlanEntry[] = [];

	for (const row of await dirtyMetaobjects(db)) {
		if (!wants(filter, 'metaobject', row.id)) continue;
		plan.push({
			type: 'metaobject',
			id: row.id,
			shopifyId: row.shopifyId,
			title: row.title,
			decision: await decideRow(gateway, 'metaobject', row.shopifyId!, stateOf(row), row.shopifyFieldHash)
		});
	}
	for (const row of await dirtyProducts(db)) {
		if (!wants(filter, 'product', row.id)) continue;
		plan.push({
			type: 'product',
			id: row.id,
			shopifyId: row.shopifyId,
			title: row.title,
			decision: await decideRow(gateway, 'product', productGid(row.shopifyId!), stateOf(row), row.shopifyFieldHash)
		});
	}
	for (const row of await dirtyVariants(db)) {
		if (!wants(filter, 'variant', row.id)) continue;
		plan.push({
			type: 'variant',
			id: row.id,
			shopifyId: row.id,
			title: row.title,
			decision: await decideRow(gateway, 'variant', row.id, stateOf(row), row.shopifyFieldHash)
		});
	}

	return plan;
}

async function log(
	db: DbClient,
	entityType: SyncEntityType,
	entityId: string,
	status: 'success' | 'failed' | 'skipped',
	errorMessage?: string,
	payload?: unknown
) {
	await db.insert(schema.syncLog).values({
		entityType,
		entityId,
		direction: 'd1_to_shopify',
		status,
		errorMessage: errorMessage ?? null,
		payload: payload ?? null
	});
}

/**
 * Execute the plan. `apply: false` (default) is a dry run: it computes and logs
 * intended actions but performs no Shopify mutations.
 */
export async function applySync(
	db: DbClient,
	gateway: ShopifyGateway,
	opts: { apply?: boolean; filter?: SyncFilter } = {}
): Promise<ApplyEntry[]> {
	const apply = opts.apply ?? false;
	const plan = await planSync(db, gateway, opts.filter);
	const results: ApplyEntry[] = [];

	for (const entry of plan) {
		// Non-push decisions (skip / conflict / needs-base) never mutate
		if (entry.decision.action !== 'push') {
			await log(db, entry.type, String(entry.shopifyId), 'skipped', entry.decision.action, entry.decision);
			results.push({ ...entry, applied: false });
			continue;
		}

		if (!apply) {
			await log(db, entry.type, String(entry.shopifyId), 'skipped', 'dry-run');
			results.push({ ...entry, applied: false });
			continue;
		}

		try {
			const now = new Date().toISOString();

			if (entry.type === 'metaobject') {
				const row = await db.query.metaobject.findFirst({
					where: eq(schema.metaobject.id, Number(entry.id))
				});
				if (!row) throw new Error('row vanished');
				const { updatedAt } = await gateway.updateMetaobject(row.shopifyId!, metaobjectToWrite(row));
				await db
					.update(schema.metaobject)
					.set({
						shopifyUpdatedAt: updatedAt,
						lastSyncedAt: now,
						shopifyFieldHash: hashFields(metaobjectManagedFields(row.fields))
					})
					.where(eq(schema.metaobject.id, row.id));
				await log(db, 'metaobject', row.shopifyId!, 'success', undefined, { updatedAt });
			} else if (entry.type === 'product') {
				const row = await db.query.product.findFirst({
					where: eq(schema.product.id, Number(entry.id))
				});
				if (!row) throw new Error('row vanished');
				const { updatedAt } = await gateway.updateProduct(productGid(row.shopifyId!), {
					title: row.title,
					descriptionHtml: row.description ?? '',
					status: productStatus(row.status)
				});
				await db
					.update(schema.product)
					.set({
						shopifyUpdatedAt: updatedAt,
						lastSyncedAt: now,
						shopifyFieldHash: hashFields(productManagedFields(row))
					})
					.where(eq(schema.product.id, row.id));
				await log(db, 'product', row.shopifyId!, 'success', undefined, { updatedAt });
			} else {
				// variant: price/sku + managed book metafields, then re-read for the watermark
				const row = await db.query.variant.findFirst({
					where: eq(schema.variant.id, String(entry.id)),
					with: { metafields: true }
				});
				if (!row) throw new Error('row vanished');
				const product = await db.query.product.findFirst({
					where: eq(schema.product.id, row.productId),
					columns: { shopifyId: true }
				});
				if (!product?.shopifyId) throw new Error('variant has no product shopifyId');

				await gateway.updateVariant(productGid(product.shopifyId), {
					id: row.id,
					price: String(row.price),
					sku: row.sku
				});
				const managed = row.metafields
					.filter(
						(m) =>
							(m.namespace === 'book' || m.namespace === 'translated_book') &&
							m.value != null &&
							m.type != null
					)
					.map((m) => ({
						ownerId: row.id,
						namespace: m.namespace,
						key: m.key,
						type: m.type as string,
						value: m.value as string
					}));
				await gateway.setMetafields(managed);

				// Both writes may bump updatedAt; read the authoritative final value
				const updatedAt = (await gateway.getUpdatedAt('variant', row.id)) ?? now;
				await db
					.update(schema.variant)
					.set({
						shopifyUpdatedAt: updatedAt,
						lastSyncedAt: now,
						shopifyFieldHash: hashFields(variantManagedFields(row))
					})
					.where(eq(schema.variant.id, row.id));
				await log(db, 'variant', row.id, 'success', undefined, { updatedAt });
			}

			results.push({ ...entry, applied: true });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			await log(db, entry.type, String(entry.shopifyId), 'failed', message);
			results.push({ ...entry, applied: false, error: message });
		}
	}

	return results;
}

/** Map our status enum to Shopify ProductStatus */
function productStatus(status: string): 'ACTIVE' | 'ARCHIVED' | 'DRAFT' {
	if (status === 'Active') return 'ACTIVE';
	if (status === 'Archived') return 'ARCHIVED';
	return 'DRAFT';
}

/**
 * Set shopify_field_hash for every row from current local state, establishing
 * the base snapshot. Valid right after a re-import (local == Shopify). Run once
 * via `npm run sync -- --rebase`; pushes keep it current thereafter.
 */
export async function rebaseFieldHashes(db: DbClient): Promise<Record<SyncEntityType, number>> {
	const counts: Record<SyncEntityType, number> = { metaobject: 0, product: 0, variant: 0 };

	for (const row of await db.query.metaobject.findMany()) {
		await db
			.update(schema.metaobject)
			.set({ shopifyFieldHash: hashFields(metaobjectManagedFields(row.fields)) })
			.where(eq(schema.metaobject.id, row.id));
		counts.metaobject++;
	}
	for (const row of await db.select().from(schema.product)) {
		await db
			.update(schema.product)
			.set({ shopifyFieldHash: hashFields(productManagedFields(row)) })
			.where(eq(schema.product.id, row.id));
		counts.product++;
	}
	for (const row of await db.select().from(schema.variant)) {
		await db
			.update(schema.variant)
			.set({ shopifyFieldHash: hashFields(variantManagedFields(row)) })
			.where(eq(schema.variant.id, row.id));
		counts.variant++;
	}

	return counts;
}
