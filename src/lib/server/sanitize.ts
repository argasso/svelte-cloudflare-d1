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
