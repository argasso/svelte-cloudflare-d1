import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 50;
	const offset = (page - 1) * limit;

	// Get products with their categories
	const products = await db
		.select({
			id: schema.product.id,
			shopifyId: schema.product.shopifyId,
			title: schema.product.title,
			description: schema.product.description,
			price: schema.product.price,
			sku: schema.product.sku,
			isbn: schema.product.isbn,
			status: schema.product.status,
			updatedAt: schema.product.updatedAt
		})
		.from(schema.product)
		.orderBy(sql`${schema.product.updatedAt} DESC`)
		.limit(limit)
		.offset(offset);

	// Get total count for pagination
	const [{ count: total }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.product);

	// Get categories for each product (simple approach for now)
	const productsWithCategories = await Promise.all(
		products.map(async (product) => {
			const categories = await db
				.select({
					id: schema.metaobject.id,
					title: schema.metaobject.title,
					handle: schema.metaobject.handle
				})
				.from(schema.metaobject)
				.innerJoin(
					schema.productsToMetaobjects,
					sql`${schema.metaobject.id} = ${schema.productsToMetaobjects.metaobjectId}`
				)
				.where(sql`${schema.productsToMetaobjects.productId} = ${product.id}`);

			return {
				...product,
				categories
			};
		})
	);

	return {
		products: productsWithCategories,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		}
	};
};
