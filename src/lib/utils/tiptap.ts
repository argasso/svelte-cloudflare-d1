/**
 * Bridge between Shopify's rich text JSON format and TipTap/ProseMirror JSON.
 *
 * The two formats describe the same small document model differently:
 *   - Shopify: { type:'root', children:[…] }; text carries bold/italic as
 *     boolean flags; a link is a *node* wrapping text children; a list-item
 *     holds inline text directly.
 *   - TipTap (ProseMirror): { type:'doc', content:[…] }; bold/italic/link are
 *     *marks* on text nodes; a listItem must contain block content (a
 *     paragraph).
 *
 * Only the node set actually used by Shopify rich text is supported:
 * paragraph, heading (level), bullet/ordered list + list-item, link, and text
 * with bold/italic. Anything else round-trips would be dropped, so the editor
 * is configured to only produce this set.
 */
import * as v from 'valibot';

// --- Shopify rich text types ---

type ShopifyText = { type: 'text'; value: string; bold?: boolean; italic?: boolean };
type ShopifyLink = {
	type: 'link';
	url: string;
	title?: string | null;
	target?: string | null;
	children: ShopifyText[];
};
type ShopifyInline = ShopifyText | ShopifyLink;
type ShopifyParagraph = { type: 'paragraph'; children: ShopifyInline[] };
type ShopifyHeading = { type: 'heading'; level: number; children: ShopifyInline[] };
type ShopifyListItem = { type: 'list-item'; children: ShopifyInline[] };
type ShopifyList = {
	type: 'list';
	listType: 'ordered' | 'unordered';
	children: ShopifyListItem[];
};
type ShopifyBlock = ShopifyParagraph | ShopifyHeading | ShopifyList;
export type ShopifyRichText = { type: 'root'; children: ShopifyBlock[] };

// --- ProseMirror/TipTap types (the subset we emit/consume) ---

type PMMark =
	| { type: 'bold' }
	| { type: 'italic' }
	| { type: 'link'; attrs: { href: string; title?: string | null; target?: string | null } };
type PMText = { type: 'text'; text: string; marks?: PMMark[] };
type PMParagraph = { type: 'paragraph'; content?: PMText[] };
type PMHeading = { type: 'heading'; attrs: { level: number }; content?: PMText[] };
type PMListItem = { type: 'listItem'; content: PMParagraph[] };
type PMList = { type: 'bulletList' | 'orderedList'; content: PMListItem[] };
type PMBlock = PMParagraph | PMHeading | PMList;
export type PMDoc = { type: 'doc'; content: PMBlock[] };

// --- Shopify -> TipTap ---

function inlineToPM(children: ShopifyInline[] | undefined): PMText[] {
	const out: PMText[] = [];
	for (const node of children ?? []) {
		if (node.type === 'link') {
			for (const text of node.children ?? []) {
				out.push(textToPM(text, { href: node.url, title: node.title, target: node.target }));
			}
		} else if (node.type === 'text') {
			out.push(textToPM(node));
		}
	}
	return out;
}

function textToPM(
	node: ShopifyText,
	link?: { href: string; title?: string | null; target?: string | null }
): PMText {
	const marks: PMMark[] = [];
	if (node.bold) marks.push({ type: 'bold' });
	if (node.italic) marks.push({ type: 'italic' });
	if (link) marks.push({ type: 'link', attrs: { href: link.href, title: link.title, target: link.target } });
	const text: PMText = { type: 'text', text: node.value ?? '' };
	if (marks.length) text.marks = marks;
	return text;
}

export function shopifyToTiptap(root: ShopifyRichText | null | undefined): PMDoc {
	const content: PMBlock[] = [];
	for (const block of root?.children ?? []) {
		if (block.type === 'paragraph') {
			content.push({ type: 'paragraph', content: inlineToPM(block.children) });
		} else if (block.type === 'heading') {
			content.push({ type: 'heading', attrs: { level: block.level ?? 2 }, content: inlineToPM(block.children) });
		} else if (block.type === 'list') {
			const list: PMList = {
				type: block.listType === 'ordered' ? 'orderedList' : 'bulletList',
				content: (block.children ?? []).map(
					(li): PMListItem => ({
						type: 'listItem',
						content: [{ type: 'paragraph', content: inlineToPM(li.children) }]
					})
				)
			};
			content.push(list);
		}
	}
	// ProseMirror requires at least one block
	if (content.length === 0) content.push({ type: 'paragraph' });
	return { type: 'doc', content };
}

// --- TipTap -> Shopify ---

function shopifyText(node: PMText): ShopifyText {
	const text: ShopifyText = { type: 'text', value: node.text ?? '' };
	if (node.marks?.some((m) => m.type === 'bold')) text.bold = true;
	if (node.marks?.some((m) => m.type === 'italic')) text.italic = true;
	return text;
}

/** Group consecutive text nodes sharing a link mark into Shopify link nodes */
function inlineToShopify(content: PMText[] | undefined): ShopifyInline[] {
	const nodes = (content ?? []).filter((n) => n.type === 'text');
	const out: ShopifyInline[] = [];
	let i = 0;
	while (i < nodes.length) {
		const linkMark = nodes[i].marks?.find((m) => m.type === 'link') as
			| Extract<PMMark, { type: 'link' }>
			| undefined;
		if (linkMark) {
			const href = linkMark.attrs.href;
			const group: ShopifyText[] = [];
			while (i < nodes.length) {
				const m = nodes[i].marks?.find((mm) => mm.type === 'link') as
					| Extract<PMMark, { type: 'link' }>
					| undefined;
				if (!m || m.attrs.href !== href) break;
				group.push(shopifyText(nodes[i]));
				i++;
			}
			// Match Shopify's shape: title is always present (null if unset),
			// target only when set — keeps round-trips diff-free.
			const link: ShopifyLink = {
				type: 'link',
				url: href,
				title: linkMark.attrs.title ?? null,
				children: group
			};
			if (linkMark.attrs.target) link.target = linkMark.attrs.target;
			out.push(link);
		} else {
			out.push(shopifyText(nodes[i]));
			i++;
		}
	}
	return out;
}

export function tiptapToShopify(doc: PMDoc | null | undefined): ShopifyRichText {
	const children: ShopifyBlock[] = [];
	for (const block of doc?.content ?? []) {
		if (block.type === 'paragraph') {
			children.push({ type: 'paragraph', children: inlineToShopify(block.content) });
		} else if (block.type === 'heading') {
			children.push({ type: 'heading', level: block.attrs?.level ?? 2, children: inlineToShopify(block.content) });
		} else if (block.type === 'bulletList' || block.type === 'orderedList') {
			children.push({
				type: 'list',
				listType: block.type === 'orderedList' ? 'ordered' : 'unordered',
				children: (block.content ?? []).map((li) => ({
					type: 'list-item',
					// a listItem holds block content (paragraphs); flatten their inline back
					children: (li.content ?? []).flatMap((b) => inlineToShopify(b.content))
				}))
			});
		}
	}
	return { type: 'root', children };
}

// --- Validation + normalization for the server boundary ---

const sText = v.object({
	type: v.literal('text'),
	value: v.string(),
	bold: v.optional(v.boolean()),
	italic: v.optional(v.boolean())
});
const sLink = v.object({
	type: v.literal('link'),
	url: v.string(),
	title: v.nullish(v.string()),
	target: v.nullish(v.string()),
	children: v.array(sText)
});
const sInline = v.union([sText, sLink]);
const sParagraph = v.object({ type: v.literal('paragraph'), children: v.array(sInline) });
const sHeading = v.object({
	type: v.literal('heading'),
	level: v.number(),
	children: v.array(sInline)
});
const sList = v.object({
	type: v.literal('list'),
	listType: v.picklist(['ordered', 'unordered']),
	children: v.array(v.object({ type: v.literal('list-item'), children: v.array(sInline) }))
});
const sRoot = v.object({
	type: v.literal('root'),
	children: v.array(v.union([sParagraph, sHeading, sList]))
});

/** True when the document carries no actual text */
export function isEmptyRichText(root: ShopifyRichText): boolean {
	const hasText = (children: ShopifyInline[]): boolean =>
		children.some((c) =>
			c.type === 'link' ? hasText(c.children) : (c.value ?? '').trim().length > 0
		);
	return !root.children.some((block) =>
		block.type === 'list'
			? block.children.some((li) => hasText(li.children))
			: hasText(block.children)
	);
}

/**
 * Valibot field for a rich-text form input: accepts a JSON string from the
 * editor, validates the Shopify structure, and normalizes to a canonical JSON
 * string — or `null` when empty. Use in remote function form schemas.
 */
export const richTextField = v.pipe(
	v.optional(v.string(), ''),
	v.rawTransform(({ dataset, addIssue, NEVER }) => {
		const raw = dataset.value.trim();
		if (!raw) return null;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			addIssue({ message: 'Invalid rich text' });
			return NEVER;
		}
		const result = v.safeParse(sRoot, parsed);
		if (!result.success) {
			addIssue({ message: 'Invalid rich text' });
			return NEVER;
		}
		return isEmptyRichText(result.output as ShopifyRichText) ? null : JSON.stringify(result.output);
	})
);

/**
 * Valibot field for an HTML rich-text input (Shopify product descriptionHtml),
 * produced by the editor in `format="html"` mode. Normalizes the editor's
 * empty-document markup to `null`.
 *
 * NOTE: this stores the HTML as-is (trusted admin input). It does NOT sanitize;
 * add server-side sanitization before rendering with {@html} for untrusted users.
 */
export const htmlField = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => {
		const trimmed = s.trim();
		// TipTap serializes an empty document as <p></p>
		return !trimmed || trimmed === '<p></p>' ? null : trimmed;
	})
);
