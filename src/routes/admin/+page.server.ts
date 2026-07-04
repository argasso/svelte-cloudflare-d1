import { eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { isDirty } from '$lib/server/sync/conflict';

type SyncRow = { updatedAt: string; lastSyncedAt: string | null; shopifyUpdatedAt: string | null };
const stateOf = (r: SyncRow) => ({
	updatedAt: r.updatedAt,
	lastSyncedAt: r.lastSyncedAt,
	shopifyUpdatedAt: r.shopifyUpdatedAt
});

export const load: PageServerLoad = async ({ locals, parent }) => {
	const db = locals.db;
	const { syncEnabled } = await parent();

	const [products, variants, authors, pages] = await Promise.all([
		db.$count(schema.product),
		db.$count(schema.variant),
		db.$count(schema.metaobject, eq(schema.metaobject.type, 'author')),
		db.$count(schema.metaobject, eq(schema.metaobject.type, 'page'))
	]);

	// Outstanding local edits not yet pushed to Shopify (mirrors the sync plan's
	// dirty rule). Only computed when the Shopify integration is on.
	let sync: { products: number; authors: number; pages: number } | null = null;
	if (syncEnabled) {
		const [prodRows, varRows, moRows] = await Promise.all([
			db
				.select({
					shopifyId: schema.product.shopifyId,
					updatedAt: schema.product.updatedAt,
					lastSyncedAt: schema.product.lastSyncedAt,
					shopifyUpdatedAt: schema.product.shopifyUpdatedAt
				})
				.from(schema.product),
			db
				.select({
					updatedAt: schema.variant.updatedAt,
					lastSyncedAt: schema.variant.lastSyncedAt,
					shopifyUpdatedAt: schema.variant.shopifyUpdatedAt
				})
				.from(schema.variant),
			db
				.select({
					type: schema.metaobject.type,
					shopifyId: schema.metaobject.shopifyId,
					updatedAt: schema.metaobject.updatedAt,
					lastSyncedAt: schema.metaobject.lastSyncedAt,
					shopifyUpdatedAt: schema.metaobject.shopifyUpdatedAt
				})
				.from(schema.metaobject)
		]);
		sync = {
			products:
				prodRows.filter((r) => r.shopifyId && isDirty(stateOf(r))).length +
				varRows.filter((r) => isDirty(stateOf(r))).length,
			authors: moRows.filter((r) => r.type === 'author' && r.shopifyId && isDirty(stateOf(r)))
				.length,
			pages: moRows.filter((r) => r.type === 'page' && r.shopifyId && isDirty(stateOf(r))).length
		};
	}

	const recentProducts = await db
		.select()
		.from(schema.product)
		.orderBy(sql`${schema.product.updatedAt} DESC`)
		.limit(10);

	return {
		stats: { products, variants, authors, pages },
		sync,
		recentProducts
	};
};
