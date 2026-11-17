/**
 * Server-side HTML sanitiser for admin-authored rich text rendered on the public
 * site with `{@html}`. Runs on the Cloudflare Workers runtime (pure JS, no DOM).
 *
 * The admin editor (TipTap, see RichTextEditor.svelte) and the Shopify rich-text
 * JSON converter only ever produce a small node set, so the allowlist mirrors
 * that exactly — anything outside it (scripts, event handlers, styles, iframes,
 * `javascript:` URLs) is stripped. Sanitise at the load boundary so the browser
 * never receives unsanitised markup, not even during SSR hydration, and the
 * sanitiser stays out of the client bundle.
 *
 * Defence-in-depth: content is admin-authored and the admin mutations are
 * JWT-guarded, but a stored-XSS sink on the public site shouldn't rely on the
 * write path staying perfectly locked down.
 */
import { filterXSS, type IFilterXSSOptions } from 'xss';

const OPTIONS: IFilterXSSOptions = {
	whiteList: {
		p: [],
		br: [],
		strong: [],
		em: [],
		b: [],
		i: [],
		u: [],
		h2: [],
		h3: [],
		h4: [],
		ul: [],
		ol: [],
		li: [],
		// xss's default safeAttrValue strips `javascript:`/unsafe URL schemes from href.
		a: ['href', 'target', 'rel']
	},
	// Drop disallowed tags entirely (not just escape them), and discard the whole
	// contents of these so no raw script/style text survives.
	stripIgnoreTag: true,
	stripIgnoreTagBody: ['script', 'style']
};

/** Sanitise an HTML string for safe `{@html}` rendering. Nullish → ''. */
export function sanitizeHtml(dirty: string | null | undefined): string {
	if (!dirty) return '';
	return filterXSS(dirty, OPTIONS);
}

/**
 * Sanitiser for Shopify shop-policy bodies. Unlike admin rich text, these are
 * authored in Shopify's page builder, so they use a richer tag set — notably
 * tables (the privacy policy lays out Ändamål/Uppgifter/Laglig grund/… as
 * two-column tables) plus structural wrappers. Keep the same XSS guarantees
 * (scripts/styles/handlers/unsafe URLs stripped), just a wider structural
 * allowlist. Presentational attributes (class/style/cellpadding) are dropped;
 * the storefront's `prose` styles handle layout.
 */
const POLICY_OPTIONS: IFilterXSSOptions = {
	whiteList: {
		p: [],
		br: [],
		hr: [],
		strong: [],
		em: [],
		b: [],
		i: [],
		u: [],
		span: [],
		h1: [],
		h2: [],
		h3: [],
		h4: [],
		h5: [],
		h6: [],
		ul: [],
		ol: [],
		li: [],
		blockquote: [],
		div: [],
		section: [],
		header: [],
		article: [],
		table: [],
		thead: [],
		tbody: [],
		tfoot: [],
		caption: [],
		colgroup: ['span'],
		col: ['span'],
		tr: [],
		th: ['colspan', 'rowspan', 'scope'],
		td: ['colspan', 'rowspan'],
		a: ['href', 'target', 'rel']
	},
	stripIgnoreTag: true,
	stripIgnoreTagBody: ['script', 'style']
};

/** Sanitise a Shopify policy body for safe `{@html}` rendering. Nullish → ''. */
export function sanitizePolicyHtml(dirty: string | null | undefined): string {
	if (!dirty) return '';
	return filterXSS(dirty, POLICY_OPTIONS);
}
