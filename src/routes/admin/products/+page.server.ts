import { and, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { applyFacets, loadFacetProducts, parseFilters } from '$lib/server/storefront/facets';

const PER_PAGE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;

	// Same facet engine as the storefront, but across every status and with the
	// text search / status facet enabled.
	const sel = parseFilters(url.searchParams);
	const { products: all, authorTitles } = await loadFacetProducts(db, undefined, {
		statuses: ['Draft', 'Active', 'Archived']
	});
	const { filtered, facets } = applyFacets(all, sel, authorTitles);

	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), totalPages);
	const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

	// Category titles for the visible rows.
	const ids = slice.map((p) => p.id);
	const catsByProduct = new Map<number, string[]>();
	if (ids.length > 0) {
		const catRows = await db
			.select({
				productId: schema.productsToMetaobjects.productId,
				title: schema.metaobject.title,
				fields: schema.metaobject.fields
			})
			.from(schema.productsToMetaobjects)
			.innerJoin(
				schema.metaobject,
				eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId)
			)
			.where(
				and(
					inArray(schema.productsToMetaobjects.productId, ids),
					eq(schema.productsToMetaobjects.relationType, 'category')
				)
			);
		for (const c of catRows) {
			// Prefer the metaobject's `name` field (used as the menu label — see
			// buildPageNav) and fall back to its title.
			const menuName = (c.fields as { name?: unknown } | null)?.name;
			const label =
				typeof menuName === 'string' && menuName.trim() ? menuName.trim() : c.title;
			if (!label) continue;
			const list = catsByProduct.get(c.productId) ?? [];
			list.push(label);
			catsByProduct.set(c.productId, list);
		}
	}

	const rows = slice.map((p) => ({
		id: p.id,
		title: p.title,
		status: p.status,
		updatedAt: p.updatedAt,
		categories: catsByProduct.get(p.id) ?? []
	}));

	return { rows, facets, sort: sel.sort, page, totalPages, total };
};
