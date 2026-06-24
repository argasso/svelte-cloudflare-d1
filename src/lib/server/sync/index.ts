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
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { decideSync, isDirty, type SyncDecision, type SyncState } from './conflict';
import type { MetaobjectWrite, ShopifyGateway, SyncEntityType } from './gateway';
import {
	gidList,
	hashFields,
	metaobjectManagedFields,
	productManagedFields,
	variantManagedFields
} from './fields';

/** Linked metaobject gids for a product, split by relation (sorted) */
export async function linkGids(db: DbClient, productId: number): Promise<{ authors: string[]; categories: string[] }> {
	const rows = await db
		.select({
			relationType: schema.productsToMetaobjects.relationType,
			shopifyId: schema.metaobject.shopifyId
		})
		.from(schema.productsToMetaobjects)
		.innerJoin(schema.metaobject, eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId))
		.where(eq(schema.productsToMetaobjects.productId, productId));

	const authors: string[] = [];
	const categories: string[] = [];
	for (const r of rows) {
		if (!r.shopifyId) continue;
		if (r.relationType === 'author') authors.push(r.shopifyId);
		else if (r.relationType === 'category') categories.push(r.shopifyId);
	}
	return { authors: authors.sort(), categories: categories.sort() };
}

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
	opts: { apply?: boolean; filter?: SyncFilter; baseUrl?: string } = {}
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

				// Authors carry a single image (a file reference). Ensure it's a
				// Shopify file and reflect its gid in fields.image ('' clears it).
				let fields = row.fields;
				if (schema.isAuthor(row)) {
					const [img] = await db
						.select()
						.from(schema.media)
						.where(
							and(
								eq(schema.media.entityType, 'metaobject'),
								eq(schema.media.entityId, String(row.id))
							)
						)
						.orderBy(schema.media.position)
						.limit(1);
					let imageGid: string | null = img?.shopifyId ?? null;
					if (img && !imageGid && img.r2Key && opts.baseUrl) {
						const base = opts.baseUrl.replace(/\/$/, '');
						const [gid] = await gateway.createFiles([
							{ originalSource: `${base}/media/${img.r2Key}`, alt: img.altText }
						]);
						if (gid) {
							await db
								.update(schema.media)
								.set({ shopifyId: gid })
								.where(eq(schema.media.id, img.id));
							imageGid = gid;
						}
					}
					fields = { ...(row.fields ?? {}), image: imageGid ?? '' };
					await db.update(schema.metaobject).set({ fields }).where(eq(schema.metaobject.id, row.id));
				} else if (schema.isPage(row)) {
					// sub_pages is derived from the local hierarchy: child page gids
					// (children by parent_id, in position order). parent_id itself is
					// never pushed — Shopify only needs sub_pages for its menu query.
					const children = await db
						.select({ shopifyId: schema.metaobject.shopifyId })
						.from(schema.metaobject)
						.where(and(eq(schema.metaobject.parentId, row.id), eq(schema.metaobject.type, 'page')))
						.orderBy(schema.metaobject.position);
					const subPages = children.map((c) => c.shopifyId).filter((g): g is string => !!g);
					fields = { ...(row.fields ?? {}), sub_pages: subPages };
					await db.update(schema.metaobject).set({ fields }).where(eq(schema.metaobject.id, row.id));
				}

				const { updatedAt } = await gateway.updateMetaobject(
					row.shopifyId!,
					metaobjectToWrite({ ...row, fields })
				);
				await db
					.update(schema.metaobject)
					.set({
						shopifyUpdatedAt: updatedAt,
						lastSyncedAt: now,
						shopifyFieldHash: hashFields(metaobjectManagedFields(fields))
					})
					.where(eq(schema.metaobject.id, row.id));
				await log(db, 'metaobject', row.shopifyId!, 'success', undefined, { updatedAt });
			} else if (entry.type === 'product') {
				const row = await db.query.product.findFirst({
					where: eq(schema.product.id, Number(entry.id))
				});
				if (!row) throw new Error('row vanished');
				const gid = productGid(row.shopifyId!);
				await gateway.updateProduct(gid, {
					title: row.title,
					descriptionHtml: row.description ?? '',
					status: productStatus(row.status),
					seoTitle: row.seoTitle,
					seoDescription: row.seoDescription
				});

				// Push category/author links as metafields: custom.authors on the
				// product, book.category on each variant (links are product-level).
				const links = await linkGids(db, row.id);
				const variants = await db
					.select({ id: schema.variant.id })
					.from(schema.variant)
					.where(eq(schema.variant.productId, row.id));
				await gateway.setMetafields([
					{
						ownerId: gid,
						namespace: 'custom',
						key: 'authors',
						type: 'list.metaobject_reference',
						value: gidList(links.authors)
					},
					...variants.map((v) => ({
						ownerId: v.id,
						namespace: 'book',
						key: 'category',
						type: 'list.metaobject_reference',
						value: gidList(links.categories)
					}))
				]);

				// Push R2-owned images not yet on Shopify. Shopify fetches them by
				// URL, so this needs the public base URL of this site (omitted from
				// the CLI unless PUBLIC_SITE_URL is set — then media stays local-only).
				if (opts.baseUrl) {
					const pendingMedia = await db
						.select()
						.from(schema.media)
						.where(
							and(
								eq(schema.media.entityType, 'product'),
								eq(schema.media.entityId, String(row.id)),
								isNull(schema.media.shopifyId),
								isNotNull(schema.media.r2Key)
							)
						)
						.orderBy(schema.media.position);
					if (pendingMedia.length > 0) {
						const base = opts.baseUrl.replace(/\/$/, '');
						const createdIds = await gateway.createProductMedia(
							gid,
							pendingMedia.map((m) => ({
								originalSource: `${base}/media/${m.r2Key}`,
								alt: m.altText
							}))
						);
						// Response media are returned in input order; store each gid.
						for (let i = 0; i < pendingMedia.length; i++) {
							if (createdIds[i]) {
								await db
									.update(schema.media)
									.set({ shopifyId: createdIds[i] })
									.where(eq(schema.media.id, pendingMedia[i].id));
							}
						}
					}
				}

				// Reconcile Shopify's gallery to local (local is the source of truth):
				// delete files no longer present locally, then apply the local order.
				const productMedia = await db
					.select({ shopifyId: schema.media.shopifyId })
					.from(schema.media)
					.where(
						and(eq(schema.media.entityType, 'product'), eq(schema.media.entityId, String(row.id)))
					)
					.orderBy(schema.media.position);
				const localGids = productMedia.map((m) => m.shopifyId).filter((g): g is string => !!g);
				const shopifyGids = await gateway.getProductMediaIds(gid);
				const toDelete = shopifyGids.filter((g) => !localGids.includes(g));
				if (toDelete.length) await gateway.deleteFiles(toDelete);
				if (localGids.length) await gateway.reorderProductMedia(gid, localGids);

				// Metafield/media writes may bump updatedAt; read the authoritative value
				const updatedAt = (await gateway.getUpdatedAt('product', gid)) ?? now;
				await db
					.update(schema.product)
					.set({
						shopifyUpdatedAt: updatedAt,
						lastSyncedAt: now,
						shopifyFieldHash: hashFields(productManagedFields(row, links.authors))
					})
					.where(eq(schema.product.id, row.id));
				await log(db, 'product', row.shopifyId!, 'success', undefined, { updatedAt });
			} else {
				// variant: price/sku + managed book metafields, then re-read for the watermark
				const row = await db.query.variant.findFirst({
					where: eq(schema.variant.id, String(entry.id)),
					with: { metafields: true, image: true }
				});
				if (!row) throw new Error('row vanished');
				const product = await db.query.product.findFirst({
					where: eq(schema.product.id, row.productId),
					columns: { shopifyId: true }
				});
				if (!product?.shopifyId) throw new Error('variant has no product shopifyId');

				// The assigned image's Shopify gid — only once that media is on
				// Shopify (products push before variants, so a freshly-uploaded
				// product image already has its gid by now). Null = leave as-is.
				await gateway.updateVariant(productGid(product.shopifyId), {
					id: row.id,
					price: String(row.price),
					sku: row.sku,
					barcode: row.barcode,
					mediaId: row.image?.shopifyId ?? null
				});
				const managed = row.metafields
					.filter(
						(m) =>
							(m.namespace === 'book' ||
								m.namespace === 'translated_book' ||
								m.namespace === 'audio_book') &&
							// book.category is a product-level link, pushed by the product sync
							!(m.namespace === 'book' && m.key === 'category') &&
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

	// Skip dirty rows: their base must reflect the last-synced Shopify state,
	// not pending local edits.
	for (const row of await db.query.metaobject.findMany()) {
		if (isDirty(stateOf(row))) continue;
		await db
			.update(schema.metaobject)
			.set({ shopifyFieldHash: hashFields(metaobjectManagedFields(row.fields)) })
			.where(eq(schema.metaobject.id, row.id));
		counts.metaobject++;
	}
	for (const row of await db.select().from(schema.product)) {
		if (isDirty(stateOf(row))) continue;
		const { authors } = await linkGids(db, row.id);
		await db
			.update(schema.product)
			.set({ shopifyFieldHash: hashFields(productManagedFields(row, authors)) })
			.where(eq(schema.product.id, row.id));
		counts.product++;
	}
	for (const row of await db.select().from(schema.variant)) {
		if (isDirty(stateOf(row))) continue;
		await db
			.update(schema.variant)
			.set({ shopifyFieldHash: hashFields(variantManagedFields(row)) })
			.where(eq(schema.variant.id, row.id));
		counts.variant++;
	}

	return counts;
}
