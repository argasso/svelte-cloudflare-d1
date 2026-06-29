/**
 * Client-safe shapes for the book listing facets. The server engine
 * ($lib/server/storefront/facets.ts) produces these; the listing page and the
 * BookFilters component consume them — neither may import the server module, so
 * the shared param names and result types live here.
 */
export type SortKey = 'titel-asc' | 'titel-desc' | 'pris-asc' | 'pris-desc';

/** Query-param names the listing uses (kept Swedish-ish and shareable). */
export const PARAM = {
	binding: 'binding',
	age: 'alder',
	level: 'niva',
	author: 'forfattare',
	discontinued: 'utgatt',
	priceMin: 'pris_min',
	priceMax: 'pris_max',
	sort: 'sort'
} as const;

export type FacetOption = { value: string; label: string; count: number; selected: boolean };

export type Facets = {
	binding: FacetOption[];
	age: FacetOption[];
	level: FacetOption[];
	author: FacetOption[];
	discontinued: FacetOption[];
	price: { min: number; max: number; selectedMin: number | null; selectedMax: number | null };
};
