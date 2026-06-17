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

	// URLs are flat (`/<handle>`); the hierarchy lives in each page's `sub_pages`
	// field (child gids), not parent_id. Resolve by the final handle segment.
	const handle = segments[segments.length - 1];
	const page = pages.find((p) => p.handle === handle) ?? null;
	if (!page || page.status !== 'Active') error(404, 'Sidan hittades inte');

	const subPagesOf = (p: (typeof pages)[number]): string[] => {
		const subs = (p.fields as { sub_pages?: unknown } | null)?.sub_pages;
		return Array.isArray(subs) ? subs.filter((g): g is string => typeof g === 'string') : [];
	};
	const byGid = new Map(pages.filter((p) => p.shopifyId).map((p) => [p.shopifyId as string, p]));

	// Breadcrumb: walk up via reverse sub_pages (who lists me as a child?), skipping
	// the topmost page, then append the current page.
	const parentOf = new Map<number, (typeof pages)[number]>();
	for (const p of pages) for (const gid of subPagesOf(p)) {
		const child = byGid.get(gid);
		if (child) parentOf.set(child.id, p);
	}
	const ancestors: (typeof pages)[number][] = [];
	for (let cur = parentOf.get(page.id); cur && cur.handle !== 'startsida'; cur = parentOf.get(cur.id)) {
		ancestors.unshift(cur);
		if (ancestors.length > 10) break; // cycle guard
	}
	const breadcrumb = [...ancestors, page].map((p) => ({
		label: p.title ?? p.handle,
		href: `/${p.handle}`
	}));

	// Sub-pages of this page (from sub_pages), in field order
	const children = subPagesOf(page)
		.map((gid) => byGid.get(gid))
		.filter((p): p is (typeof pages)[number] => !!p && p.status === 'Active')
		.map((p) => ({ id: p.id, title: p.title ?? p.handle, handle: p.handle, href: `/${p.handle}` }));

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
