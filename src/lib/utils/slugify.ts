/**
 * Generate a handle from a title.
 *
 * Matches the handle convention of the existing Shopify metaobjects:
 * ö→oe (goeran-olsson, selma-lagerloef) but ä→a, å→a (emma-faldt)
 */
export function slugify(title: string) {
	return title
		.toLowerCase()
		.replace(/ö/g, 'oe')
		.replace(/ø/g, 'oe')
		.replace(/æ/g, 'ae')
		.replace(/ß/g, 'ss')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
