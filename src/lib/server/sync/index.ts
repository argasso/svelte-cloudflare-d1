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

/** Read-only: compute what sync would do for every dirty row (optionally filtered). */
export async function planSync(
	db: DbClient,
	gateway: ShopifyGateway,
	filter?: SyncFilter
): Promise<PlanEntry[]> {
	const plan: PlanEntry[] = [];

	for (const row of await dirtyMetaobjects(db)) {
		if (!wants(filter, 'metaobject', row.id)) continue;
		const remote = await gateway.getUpdatedAt('metaobject', row.shopifyId!);
		plan.push({
			type: 'metaobject',
			id: row.id,
			shopifyId: row.shopifyId,
			title: row.title,
			decision: decideSync(stateOf(row), remote)
		});
	}
	for (const row of await dirtyProducts(db)) {
		if (!wants(filter, 'product', row.id)) continue;
		const remote = await gateway.getUpdatedAt('product', row.shopifyId!);
		plan.push({
			type: 'product',
			id: row.id,
			shopifyId: row.shopifyId,
			title: row.title,
			decision: decideSync(stateOf(row), remote)
		});
	}
	for (const row of await dirtyVariants(db)) {
		if (!wants(filter, 'variant', row.id)) continue;
		const remote = await gateway.getUpdatedAt('variant', row.id);
		plan.push({
			type: 'variant',
			id: row.id,
			shopifyId: row.id,
			title: row.title,
			decision: decideSync(stateOf(row), remote)
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

		// Push, but only metaobjects are wired up so far
		if (entry.type !== 'metaobject') {
			await log(db, entry.type, String(entry.shopifyId), 'skipped', 'push-unsupported');
			results.push({ ...entry, applied: false, error: 'push not implemented for ' + entry.type });
			continue;
		}

		if (!apply) {
			await log(db, entry.type, String(entry.shopifyId), 'skipped', 'dry-run');
			results.push({ ...entry, applied: false });
			continue;
		}

		try {
			const row = await db.query.metaobject.findFirst({
				where: eq(schema.metaobject.id, Number(entry.id))
			});
			if (!row) throw new Error('row vanished');
			const { updatedAt } = await gateway.updateMetaobject(row.shopifyId!, metaobjectToWrite(row));
			const now = new Date().toISOString();
			await db
				.update(schema.metaobject)
				.set({ shopifyUpdatedAt: updatedAt, lastSyncedAt: now })
				.where(eq(schema.metaobject.id, row.id));
			await log(db, 'metaobject', row.shopifyId!, 'success', undefined, { updatedAt });
			results.push({ ...entry, applied: true });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			await log(db, entry.type, String(entry.shopifyId), 'failed', message);
			results.push({ ...entry, applied: false, error: message });
		}
	}

	return results;
}
