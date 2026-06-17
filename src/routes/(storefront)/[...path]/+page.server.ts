import { and, eq, getTableColumns } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	const segments = params.path.split('/').filter(Boolean);
	if (segments.length === 0) error(404, 'Sidan hittades inte');

	const pages = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'));

	// Walk the handle path through the hierarchy (each segment a child of the
	// previous), building breadcrumbs as we go.
	let parentId: number | null = null;
	let page: (typeof pages)[number] | null = null;
	const breadcrumb: { label: string; href: string }[] = [];
	let href = '';
	for (const seg of segments) {
		page = pages.find((p) => p.handle === seg && p.parentId === parentId) ?? null;
		if (!page || page.status !== 'Active') error(404, 'Sidan hittades inte');
		href = `${href}/${seg}`;
		breadcrumb.push({ label: page.title ?? page.handle, href });
		parentId = page.id;
	}
	if (!page) error(404, 'Sidan hittades inte');

	// Sub-pages (child categories) of this page
	const children = pages
		.filter((p) => p.parentId === page!.id && p.status === 'Active')
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map((p) => ({
			id: p.id,
			title: p.title ?? p.handle,
			handle: p.handle,
			href: `${href}/${p.handle}`
		}));

	// Books linked to this page as a category
	const linked = await db
		.select(getTableColumns(schema.product))
		.from(schema.product)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.productsToMetaobjects.productId, schema.product.id)
		)
		.where(
			and(
				eq(schema.productsToMetaobjects.metaobjectId, page.id),
				eq(schema.productsToMetaobjects.relationType, 'category'),
				eq(schema.product.status, 'Active')
			)
		)
		.orderBy(schema.product.title);

	return { page, breadcrumb, children, products: await attachCovers(db, linked) };
};
