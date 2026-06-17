import { and, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Get all active products
	const products = await db
		.select()
		.from(schema.product)
		.where(eq(schema.product.status, 'Active'))
		.orderBy(schema.product.title)
		.limit(100);

	// Category pills = the "bocker" page's sub_pages (child gids), flat URLs.
	const [bockerPage] = await db
		.select({ fields: schema.metaobject.fields })
		.from(schema.metaobject)
		.where(and(eq(schema.metaobject.type, 'page'), eq(schema.metaobject.handle, 'bocker')))
		.limit(1);

	const subGids = (bockerPage?.fields as { sub_pages?: unknown } | null)?.sub_pages;
	let categories: { handle: string; label: string }[] = [];
	if (Array.isArray(subGids) && subGids.length > 0) {
		const rows = await db
			.select({
				handle: schema.metaobject.handle,
				title: schema.metaobject.title,
				fields: schema.metaobject.fields,
				shopifyId: schema.metaobject.shopifyId
			})
			.from(schema.metaobject)
			.where(
				and(
					eq(schema.metaobject.type, 'page'),
					eq(schema.metaobject.status, 'Active'),
					inArray(schema.metaobject.shopifyId, subGids as string[])
				)
			);
		const byGid = new Map(rows.map((r) => [r.shopifyId, r]));
		categories = (subGids as string[])
			.map((g) => byGid.get(g))
			.filter((r): r is (typeof rows)[number] => !!r)
			.map((r) => ({
				handle: r.handle,
				label: (r.fields as { name?: string } | null)?.name || r.title || r.handle
			}));
	}

	return {
		products: await attachCovers(db, products),
		categories
	};
};
