import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Get statistics
	const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.product);
	const [variantCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.variant);
	const [metaobjectCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.metaobject);
	const [linkCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.productsToMetaobjects);

	// Get recent products
	const recentProducts = await db
		.select()
		.from(schema.product)
		.orderBy(sql`${schema.product.updatedAt} DESC`)
		.limit(10);

	return {
		stats: {
			products: productCount.count,
			variants: variantCount.count,
			categories: metaobjectCount.count,
			links: linkCount.count
		},
		recentProducts
	};
};
