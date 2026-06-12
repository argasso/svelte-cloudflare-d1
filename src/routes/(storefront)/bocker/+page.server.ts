import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Get all active products
	const products = await db
		.select()
		.from(schema.product)
		.where(eq(schema.product.status, 'Active'))
		.orderBy(schema.product.title)
		.limit(100);

	// Get main categories (pages that are children of "bocker")
	const bockerCategory = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.handle, 'bocker'))
		.limit(1);

	let categories: any[] = [];
	if (bockerCategory.length > 0) {
		categories = await db
			.select()
			.from(schema.metaobject)
			.where(eq(schema.metaobject.parentId, bockerCategory[0].id))
			.orderBy(schema.metaobject.position);
	}

	return {
		products,
		categories
	};
};
