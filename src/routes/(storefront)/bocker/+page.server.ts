import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachProductCovers, attachPrices } from '$lib/server/storefront/media';
import { applyFacets, loadFacetProducts, parseFilters } from '$lib/server/storefront/facets';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;

	// Faceted browse: load the filterable shape of the whole (small) catalogue,
	// filter + sort + count in memory, then hydrate only the visible page.
	const sel = parseFilters(url.searchParams);
	const { products: all, authorTitles } = await loadFacetProducts(db);
	const { filtered, facets } = applyFacets(all, sel, authorTitles);

	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), totalPages);
	const slice = filtered
		.slice((page - 1) * PER_PAGE, page * PER_PAGE)
		.map((p) => ({ id: p.id, title: p.title, handle: p.handle }));

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
		products: await attachPrices(db, await attachProductCovers(db, slice)),
		categories,
		facets,
		sort: sel.sort,
		page,
		totalPages,
		total
	};
};
