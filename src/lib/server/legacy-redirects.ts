/**
 * Legacy URL redirects (Joomla → this site). The old site used hierarchical
 * `/boecker/...` and `/information/...` paths with `.html` book pages; this app
 * serves books at `/bok/<handle>`, authors at `/forfattare/<handle>`, and
 * everything else as flat pages at `/<handle>`. These 301s keep old inbound
 * links and search-engine results working.
 *
 * Ported from the production storefront, with category/info targets rewritten
 * to this app's flat page handles so each old URL lands on its page in a single
 * hop (no second redirect through the `[...path]` flattener).
 */

// Old Joomla category / information URLs → this site's flat page handles.
const CATEGORY_REDIRECTS: Record<string, string> = {
	'/boecker': '/bocker',
	'/boecker/laettlaest': '/bocker',
	'/boecker/kapitelboecker': '/barnbocker',
	'/boecker/boerja-laesa': '/barnbocker',
	'/boecker/grafiska-romaner': '/grafiska-romaner',
	'/boecker/grafiska-romaner/klassiska-seriealbum': '/grafiska-romaner',
	'/boecker/faktaboecker': '/faktabocker',
	'/boecker/faktaboecker/foerfaerliga-fakta': '/forfarliga-fakta',
	'/boecker/ljudboecker': '/e-bocker-ljud',
	'/boecker/e-boecker': '/e-bocker',
	'/boecker/kommande-utgivning': '/bocker',
	'/borja-lasa': '/barnbocker',
	'/information/om-argasso': '/om-argasso',
	'/information/om-argasso/foerlaget': '/om-argasso',
	'/information/kontakta-oss': '/kontakta-oss',
	'/information/kontakta-oss/distribution': '/kontakta-oss',
	'/information/kontakta-oss/vi-pa-argasso': '/om-argasso',
	'/information/kontakta-oss/foersaeljning': '/kontakta-oss',
	'/information/var-katalog': '/var-katalog',
	'/information/press': '/press',
	'/information/press/foerfattare': '/forfattare',
	'/information/press/recensionsexemplar': '/press',
	'/information/studiematerial': '/studiematerial'
};

// Old Joomla book slugs that differ from the new Shopify handle.
const BOOK_SLUG_REMAPS: Record<string, string> = {
	'röda-dödens-mask': 'roda-dodens-mask-och-andra-noveller',
	'välkommen-till-camp-killer': 'vaelkommen-till-camp-killer',
	fotbollsakademin: 'fotbollsakademin-avspark',
	'roda-dodens-mask': 'roda-dodens-mask-och-andra-noveller'
};

// Old manufacturer slugs with adapter names baked in → actual author handle.
const AUTHOR_SLUG_OVERRIDES: Record<string, string> = {
	'am-stoker-manusbearbetning-jason-cobley': 'bram-stoker',
	'william-shakespeare-manusbearbetning-john-mcdonald': 'william-shakespeare',
	'emily-bronte-manusbearbetning-sean-m-wilson': 'emily-bronte',
	'nike-bengtzelius-christian-axelsson': 'nike-bengtzelius-christian-axelsson'
};

/** Resolve a legacy path to its new location, or null if it isn't a legacy URL. */
export function getLegacyRedirect(rawPath: string): string | null {
	let path: string;
	try {
		path = decodeURIComponent(rawPath);
	} catch {
		path = rawPath;
	}
	const p = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;

	// 1. Exact category / information page matches
	if (CATEGORY_REDIRECTS[p]) return CATEGORY_REDIRECTS[p];

	// 2. Old book pages with .html extension: /boecker/{category}/{slug}.html
	const htmlBookMatch = p.match(/^\/boecker\/[^/]+\/(.+)\.html$/);
	if (htmlBookMatch) {
		const slug = BOOK_SLUG_REMAPS[htmlBookMatch[1]] ?? htmlBookMatch[1];
		return `/bok/${slug}`;
	}

	// 3. Old book pages without .html: /boecker/{category}/{slug}
	const plainBookMatch = p.match(/^\/boecker\/[^/]+\/([^/]+)$/);
	if (plainBookMatch) {
		const slug = BOOK_SLUG_REMAPS[plainBookMatch[1]] ?? plainBookMatch[1];
		return `/bok/${slug}`;
	}

	// 4. Old author press pages: /information/press/foerfattare/manufacturer(s)/{slug}
	const manufacturerMatch = p.match(/^\/information\/press\/foerfattare\/manufacturers?\/([^/?]+)/);
	if (manufacturerMatch) {
		const slug = AUTHOR_SLUG_OVERRIDES[manufacturerMatch[1]] ?? manufacturerMatch[1];
		return `/forfattare/${slug}`;
	}

	// 5. Any other /information/* or /boecker/* falls back to safe defaults
	if (p.startsWith('/information/')) return '/om-argasso';
	if (p.startsWith('/boecker/')) return '/bocker';

	return null;
}
