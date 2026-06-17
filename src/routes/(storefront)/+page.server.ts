import { eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Get featured/recent products
	const products = await db
		.select()
		.from(schema.product)
		.where(eq(schema.product.status, 'Active'))
		.orderBy(sql`${schema.product.updatedAt} DESC`)
		.limit(12);

	// Get main navigation (root categories)
	const rootCategories = await db
		.select()
		.from(schema.metaobject)
		.where(sql`${schema.metaobject.parentId} IS NULL`)
		.orderBy(schema.metaobject.position);

	return {
		products: await attachCovers(db, products),
		categories: rootCategories
	};
};
