import { and, eq } from 'drizzle-orm';
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

	// Category pills = children of the "bocker" page (by parent_id), flat URLs.
	const [bockerPage] = await db
		.select({ id: schema.metaobject.id })
		.from(schema.metaobject)
		.where(and(eq(schema.metaobject.type, 'page'), eq(schema.metaobject.handle, 'bocker')))
		.limit(1);

	let categories: { handle: string; label: string }[] = [];
	if (bockerPage) {
		const rows = await db
			.select({
				handle: schema.metaobject.handle,
				title: schema.metaobject.title,
				fields: schema.metaobject.fields
			})
			.from(schema.metaobject)
			.where(
				and(eq(schema.metaobject.parentId, bockerPage.id), eq(schema.metaobject.status, 'Active'))
			)
			.orderBy(schema.metaobject.position);
		categories = rows.map((r) => ({
			handle: r.handle,
			label: (r.fields as { name?: string } | null)?.name || r.title || r.handle
		}));
	}

	return {
		products: await attachCovers(db, products),
		categories
	};
};
