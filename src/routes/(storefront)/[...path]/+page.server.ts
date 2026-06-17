import { and, eq, getTableColumns } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const db = locals.db;
	const segments = params.path.split('/').filter(Boolean);
	if (segments.length === 0) error(404, 'Sidan hittades inte');

	const pages = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'));

	// URLs are flat (`/<handle>`); the hierarchy is parent_id. Resolve the page by
	// the final handle segment.
	const handle = segments[segments.length - 1];
	const page = pages.find((p) => p.handle === handle) ?? null;
	if (!page || page.status !== 'Active') error(404, 'Sidan hittades inte');

	const byId = new Map(pages.map((p) => [p.id, p]));

	// Breadcrumb: walk up parent_id, skipping the topmost page, then the current.
	const ancestors: (typeof pages)[number][] = [];
	for (
		let cur = page.parentId != null ? byId.get(page.parentId) : undefined;
		cur && cur.handle !== 'startsida';
		cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
	) {
		ancestors.unshift(cur);
		if (ancestors.length > 10) break; // cycle guard
	}
	const breadcrumb = [...ancestors, page].map((p) => ({
		label: p.title ?? p.handle,
		href: `/${p.handle}`
	}));

	// Sub-pages of this page (children by parent_id)
	const children = pages
		.filter((p) => p.parentId === page.id && p.status === 'Active')
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map((p) => ({ id: p.id, title: p.title ?? p.handle, handle: p.handle, href: `/${p.handle}` }));

	// Books linked to this page as a category (paged for fast renders)
	const linkFilter = and(
		eq(schema.productsToMetaobjects.metaobjectId, page.id),
		eq(schema.productsToMetaobjects.relationType, 'category'),
		eq(schema.product.status, 'Active')
	);
	const total = await db
		.select({ id: schema.product.id })
		.from(schema.product)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.productsToMetaobjects.productId, schema.product.id)
		)
		.where(linkFilter)
		.then((r) => r.length);
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const pageNum = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), totalPages);

	const linked = await db
		.select(getTableColumns(schema.product))
		.from(schema.product)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.productsToMetaobjects.productId, schema.product.id)
		)
		.where(linkFilter)
		.orderBy(schema.product.title)
		.limit(PER_PAGE)
		.offset((pageNum - 1) * PER_PAGE);

	return {
		page,
		breadcrumb,
		children,
		products: await attachCovers(db, linked),
		pageNum,
		totalPages,
		total
	};
};
