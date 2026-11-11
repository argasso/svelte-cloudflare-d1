import { and, eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { env } from '$env/dynamic/public';
import { attachCategoryVariantCovers, attachPrices } from '$lib/server/storefront/media';
import { applyFacets, loadFacetProducts, parseFilters } from '$lib/server/storefront/facets';
import { pagePath } from '$lib/server/storefront/nav';
import { getLegacyRedirect } from '$lib/server/legacy-redirects';
import { getSettings } from '$lib/server/settings';
import { convertSchemaToHtml } from '$lib/utils/richtext';
import { sanitizeHtml } from '$lib/server/sanitize';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const db = locals.db;
	const segments = params.path.split('/').filter(Boolean);
	if (segments.length === 0) error(404, 'Sidan hittades inte');

	const pages = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'));

	const byId = new Map(pages.map((p) => [p.id, p]));
	const requestedPath = '/' + segments.join('/');

	// URLs are hierarchical (`/<ancestor>/…/<handle>`), mirroring parent_id, so
	// they match the legacy live-site URLs. A page's one canonical URL is its full
	// path — prefer an exact match.
	const page =
		pages.find((p) => p.status === 'Active' && pagePath(p, byId) === requestedPath) ?? null;

	if (!page) {
		// Curated legacy (Joomla) redirects win over the generic handle fallback so
		// their SEO-chosen targets are preserved (e.g. the old `/boecker/…` category
		// tree and deep `/information/…` URLs that have no 1:1 page today). Canonical
		// hierarchical pages already matched above, so this never shadows a live page.
		const legacy = getLegacyRedirect(url.pathname);
		if (legacy) redirect(301, `${legacy}${url.search}`);

		// Otherwise fall back to the final handle segment so a bare `/<handle>` or an
		// outdated ancestor chain still resolves — 301 to the canonical hierarchical
		// path so there's only one indexable URL, preserving the query string.
		const handle = segments[segments.length - 1];
		const byHandle = pages.find((p) => p.handle === handle && p.status === 'Active') ?? null;
		if (!byHandle) error(404, 'Sidan hittades inte');
		redirect(301, `${pagePath(byHandle, byId)}${url.search}`);
	}

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
		href: pagePath(p, byId)
	}));

	// Sub-pages of this page (children by parent_id)
	const children = pages
		.filter((p) => p.parentId === page.id && p.status === 'Active')
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map((p) => ({ id: p.id, title: p.title ?? p.handle, handle: p.handle, href: pagePath(p, byId) }));

	// Product ids linked to this page as a category — the set the facets scope to.
	const linkRows = await db
		.select({ productId: schema.productsToMetaobjects.productId })
		.from(schema.productsToMetaobjects)
		.innerJoin(schema.product, eq(schema.productsToMetaobjects.productId, schema.product.id))
		.where(
			and(
				eq(schema.productsToMetaobjects.metaobjectId, page.id),
				eq(schema.productsToMetaobjects.relationType, 'category'),
				eq(schema.product.status, 'Active')
			)
		);
	const categoryIds = new Set(linkRows.map((r) => r.productId));

	// Faceted browse scoped to this category (same engine as /bocker).
	const sel = parseFilters(url.searchParams);
	const { products: all, authorTitles } = await loadFacetProducts(db, categoryIds);
	const { filtered, facets } = applyFacets(all, sel, authorTitles);

	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const pageNum = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), totalPages);
	const slice = filtered
		.slice((pageNum - 1) * PER_PAGE, pageNum * PER_PAGE)
		.map((p) => ({ id: p.id, title: p.title, handle: p.handle }));

	// Handle-based special sections. Currently: `var-katalog` gets a PDF
	// download + print-order form; add more here as needed.
	const isCataloguePage = page.handle === 'var-katalog';
	const catalogueData = isCataloguePage
		? {
				catalogue: (await getSettings(db)).catalogue,
				turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? null,
				// The form navigates to ?ordered=1 on success; a URL-driven signal
				// beats trying to hold client-side "submitted" state through form
				// auto-invalidation and other reactivity edge cases.
				justOrdered: url.searchParams.get('ordered') === '1'
			}
		: null;

	// Page content is Shopify rich-text JSON → HTML, rendered with {@html};
	// convert and sanitise server-side so only safe markup reaches the browser.
	const contentRaw = (page.fields as { content?: unknown } | null)?.content;
	let contentHtml = '';
	if (contentRaw) {
		try {
			contentHtml = sanitizeHtml(
				convertSchemaToHtml(typeof contentRaw === 'string' ? JSON.parse(contentRaw) : contentRaw)
			);
		} catch {
			contentHtml = '';
		}
	}

	return {
		page,
		contentHtml,
		breadcrumb,
		children,
		hasBooks: categoryIds.size > 0,
		products: await attachPrices(db, await attachCategoryVariantCovers(db, slice, page.shopifyId)),
		facets,
		sort: sel.sort,
		pageNum,
		totalPages,
		total,
		catalogueSection: catalogueData
	};
};
