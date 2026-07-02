/**
 * In-memory faceted filtering + sorting for the book listing.
 *
 * The catalogue is small (a few hundred products), so rather than build complex
 * SQL we load the filterable shape of every active product once and compute
 * matches and facet counts in JS. Facets mirror what the old Shopify Search
 * exposed: Pris, Rekommenderad ålder, Författare, Lättlästnivå, Utgått, Binding.
 *
 * Filter semantics (like Shopify): values within one facet are OR'd; facets are
 * AND'd. The variant-level facets (binding/age/level/discontinued/price) must be
 * satisfied by a SINGLE variant (so "Inbunden under 100 kr" means one variant is
 * both), while Författare is a product-level link.
 *
 * Facet counts answer "how many books if I also pick this value", computed with
 * every OTHER active facet applied but ignoring the facet's own selection — so
 * users see the alternatives within a facet.
 */
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { BINDINGS, AGES, READING_LEVELS } from '$lib/book-fields';
import { PARAM, type Facets, type FacetOption, type SortKey } from '$lib/book-filters';

const SORTS: SortKey[] = ['titel-asc', 'titel-desc', 'pris-asc', 'pris-desc'];

export type FacetSelection = {
	binding: string[];
	age: string[];
	level: string[];
	author: number[];
	discontinued: string[]; // 'true' | 'false'
	priceMin: number | null;
	priceMax: number | null;
	sort: SortKey;
};

export function parseFilters(params: URLSearchParams): FacetSelection {
	const num = (s: string | null) => {
		if (!s) return null;
		const n = Number(s.replace(',', '.'));
		return Number.isFinite(n) ? n : null;
	};
	const sortRaw = params.get(PARAM.sort) as SortKey | null;
	return {
		binding: params.getAll(PARAM.binding),
		age: params.getAll(PARAM.age),
		level: params.getAll(PARAM.level),
		author: params
			.getAll(PARAM.author)
			.map((s) => Number(s))
			.filter((n) => Number.isInteger(n)),
		discontinued: params.getAll(PARAM.discontinued).filter((v) => v === 'true' || v === 'false'),
		priceMin: num(params.get(PARAM.priceMin)),
		priceMax: num(params.get(PARAM.priceMax)),
		sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : 'titel-asc'
	};
}

type VariantProfile = {
	price: number;
	binding: string;
	age: string;
	level: string;
	discontinued: boolean;
};

export type FacetProduct = {
	id: number;
	title: string | null;
	handle: string | null;
	variants: VariantProfile[];
	authorIds: number[];
	minPrice: number;
};

/**
 * Load the filterable shape of every active product (+ author titles).
 * `restrictTo`, when given, keeps only those product ids (e.g. a category's
 * linked products) so facet counts are scoped to that set.
 */
export async function loadFacetProducts(
	db: DbClient,
	restrictTo?: Set<number>
): Promise<{ products: FacetProduct[]; authorTitles: Map<number, string> }> {
	const productRows = (
		await db
			.select({ id: schema.product.id, title: schema.product.title, handle: schema.product.handle })
			.from(schema.product)
			.where(eq(schema.product.status, 'Active'))
	).filter((p) => !restrictTo || restrictTo.has(p.id));
	const activeIds = new Set(productRows.map((p) => p.id));

	const variantRows = await db
		.select({ id: schema.variant.id, productId: schema.variant.productId, price: schema.variant.price })
		.from(schema.variant);

	// Variant book metafields used as facets (one query, few keys).
	const mfRows = await db
		.select({ ownerId: schema.metafield.ownerId, key: schema.metafield.key, value: schema.metafield.value })
		.from(schema.metafield)
		.where(
			and(
				eq(schema.metafield.namespace, 'book'),
				eq(schema.metafield.ownerType, 'variant'),
				inArray(schema.metafield.key, ['binding', 'age', 'reading_level', 'discontinued'])
			)
		);
	const mfByVariant = new Map<string, Record<string, string>>();
	for (const m of mfRows) {
		const rec = mfByVariant.get(m.ownerId) ?? {};
		if (m.value != null) rec[m.key] = m.value;
		mfByVariant.set(m.ownerId, rec);
	}

	const authorRows = await db
		.select({
			productId: schema.productsToMetaobjects.productId,
			authorId: schema.metaobject.id,
			title: schema.metaobject.title
		})
		.from(schema.productsToMetaobjects)
		.innerJoin(schema.metaobject, eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId))
		.where(eq(schema.productsToMetaobjects.relationType, 'author'));
	const authorTitles = new Map<number, string>();
	const authorsByProduct = new Map<number, number[]>();
	for (const a of authorRows) {
		if (a.title) authorTitles.set(a.authorId, a.title);
		const list = authorsByProduct.get(a.productId) ?? [];
		list.push(a.authorId);
		authorsByProduct.set(a.productId, list);
	}

	const variantsByProduct = new Map<number, VariantProfile[]>();
	for (const v of variantRows) {
		if (!activeIds.has(v.productId)) continue;
		const mf = mfByVariant.get(v.id) ?? {};
		const list = variantsByProduct.get(v.productId) ?? [];
		list.push({
			price: v.price,
			binding: mf.binding ?? '',
			age: mf.age ?? '',
			level: mf.reading_level ?? '',
			discontinued: mf.discontinued === 'true'
		});
		variantsByProduct.set(v.productId, list);
	}

	const products: FacetProduct[] = productRows.map((p) => {
		const variants = variantsByProduct.get(p.id) ?? [];
		const prices = variants.map((v) => v.price);
		return {
			id: p.id,
			title: p.title,
			handle: p.handle,
			variants,
			authorIds: authorsByProduct.get(p.id) ?? [],
			minPrice: prices.length ? Math.min(...prices) : 0
		};
	});

	return { products, authorTitles };
}

type FacetName = 'binding' | 'age' | 'level' | 'discontinued' | 'price';

/** Does some single variant satisfy the variant-level facets? */
function existsVariant(
	p: FacetProduct,
	sel: FacetSelection,
	opts: { ignore?: FacetName; extra?: { facet: FacetName; value: string } } = {}
): boolean {
	const { ignore, extra } = opts;
	return p.variants.some((v) => {
		if (ignore !== 'binding' && sel.binding.length && !sel.binding.includes(v.binding)) return false;
		if (ignore !== 'age' && sel.age.length && !sel.age.includes(v.age)) return false;
		if (ignore !== 'level' && sel.level.length && !sel.level.includes(v.level)) return false;
		if (
			ignore !== 'discontinued' &&
			sel.discontinued.length &&
			!sel.discontinued.includes(String(v.discontinued))
		)
			return false;
		if (ignore !== 'price') {
			if (sel.priceMin != null && v.price < sel.priceMin) return false;
			if (sel.priceMax != null && v.price > sel.priceMax) return false;
		}
		if (extra) {
			if (extra.facet === 'binding' && v.binding !== extra.value) return false;
			if (extra.facet === 'age' && v.age !== extra.value) return false;
			if (extra.facet === 'level' && v.level !== extra.value) return false;
			if (extra.facet === 'discontinued' && String(v.discontinued) !== extra.value) return false;
		}
		return true;
	});
}

function authorOk(p: FacetProduct, sel: FacetSelection, ignore = false): boolean {
	if (ignore || sel.author.length === 0) return true;
	return p.authorIds.some((id) => sel.author.includes(id));
}

function matches(p: FacetProduct, sel: FacetSelection): boolean {
	return existsVariant(p, sel) && authorOk(p, sel);
}

const sortComparators: Record<SortKey, (a: FacetProduct, b: FacetProduct) => number> = {
	'titel-asc': (a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'sv'),
	'titel-desc': (a, b) => (b.title ?? '').localeCompare(a.title ?? '', 'sv'),
	'pris-asc': (a, b) => a.minPrice - b.minPrice,
	'pris-desc': (a, b) => b.minPrice - a.minPrice
};

/** Filter + sort the products and compute facet option counts. */
export function applyFacets(
	products: FacetProduct[],
	sel: FacetSelection,
	authorTitles: Map<number, string>
): { filtered: FacetProduct[]; facets: Facets } {
	const filtered = products.filter((p) => matches(p, sel)).sort(sortComparators[sel.sort]);

	// Count helper for a variant-level facet value: every other facet applied,
	// this facet's own selection ignored, plus the candidate value required.
	const variantCount = (facet: FacetName, value: string) =>
		products.filter(
			(p) =>
				existsVariant(p, sel, { ignore: facet, extra: { facet, value } }) && authorOk(p, sel)
		).length;

	const buildEnum = (facet: 'binding' | 'age' | 'level', values: string[], selected: string[]) =>
		values
			.map((value) => ({
				value,
				label: facet === 'level' ? `Nivå ${value}` : value,
				count: variantCount(facet, value),
				selected: selected.includes(value)
			}))
			.filter((o) => o.count > 0 || o.selected);

	// Author counts: variant facets applied normally, author selection ignored.
	const authorIdsInData = [...authorTitles.keys()];
	const author: FacetOption[] = authorIdsInData
		.map((id) => ({
			value: String(id),
			label: authorTitles.get(id) ?? '',
			count: products.filter((p) => existsVariant(p, sel) && p.authorIds.includes(id)).length,
			selected: sel.author.includes(id)
		}))
		.filter((o) => o.count > 0 || o.selected)
		.sort((a, b) => a.label.localeCompare(b.label, 'sv'));

	const discontinued: FacetOption[] = (['false', 'true'] as const)
		.map((value) => ({
			value,
			label: value === 'true' ? 'Utgången' : 'I tryck',
			count: variantCount('discontinued', value),
			selected: sel.discontinued.includes(value)
		}))
		.filter((o) => o.count > 0 || o.selected);

	// Price slider bounds + distribution over the set matching every other facet
	// (price ignored), so dragging one thumb still shows the full spread.
	const priceCandidates = products.filter(
		(p) => existsVariant(p, sel, { ignore: 'price' }) && authorOk(p, sel)
	);
	const allPrices = priceCandidates.flatMap((p) => p.variants.map((v) => v.price));
	const min = allPrices.length ? Math.floor(Math.min(...allPrices)) : 0;
	const max = allPrices.length ? Math.ceil(Math.max(...allPrices)) : 0;

	// Histogram: each book placed by its lowest price (the "från" price shown).
	const BUCKETS = 20;
	const histogram: { from: number; to: number; count: number }[] = [];
	if (max > min) {
		const width = (max - min) / BUCKETS;
		const counts = new Array(BUCKETS).fill(0);
		for (const p of priceCandidates) {
			const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor((p.minPrice - min) / width)));
			counts[i]++;
		}
		for (let i = 0; i < BUCKETS; i++) {
			histogram.push({
				from: Math.round(min + i * width),
				to: Math.round(min + (i + 1) * width),
				count: counts[i]
			});
		}
	} else if (allPrices.length) {
		histogram.push({ from: min, to: max, count: priceCandidates.length });
	}

	const price = { min, max, selectedMin: sel.priceMin, selectedMax: sel.priceMax, histogram };

	return {
		filtered,
		facets: {
			binding: buildEnum('binding', BINDINGS, sel.binding),
			age: buildEnum('age', AGES, sel.age),
			level: buildEnum('level', READING_LEVELS, sel.level),
			author,
			discontinued,
			price
		}
	};
}
