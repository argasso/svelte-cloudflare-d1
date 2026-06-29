import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachProductCovers, attachPrices } from '$lib/server/storefront/media';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;

	const total = await db.$count(schema.product, eq(schema.product.status, 'Active'));
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), totalPages);

	// One page of active products (small payload → fast render).
	const products = await db
		.select()
		.from(schema.product)
		.where(eq(schema.product.status, 'Active'))
		.orderBy(schema.product.title)
		.limit(PER_PAGE)
		.offset((page - 1) * PER_PAGE);

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
		products: await attachPrices(db, await attachProductCovers(db, products)),
		categories,
		page,
		totalPages,
		total
	};
};
