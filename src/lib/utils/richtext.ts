/**
 * Shopify Rich Text converter
 * Converts Shopify's JSON rich text format to HTML
 */

type Element = {
	type: string;
	value?: string;
	children?: Element[];
	level?: number;
	listType?: string;
	url?: string;
	title?: string;
	target?: string;
	bold?: boolean;
	italic?: boolean;
};

export function convertSchemaToHtml(arr: any, scoped: boolean | string = false): string {
	let html = '';

	if (arr.type === 'root' && arr.children?.length > 0) {
		if (scoped) {
			html += `
      <div class="${scoped === true ? 'rte' : scoped}">
        ${convertSchemaToHtml(arr.children)}
      </div>
      `;
		} else {
			html += convertSchemaToHtml(arr.children);
		}
	} else if (Array.isArray(arr)) {
		for (const el of arr) {
			switch (el.type) {
				case 'paragraph':
					html += buildParagraph(el);
					break;
				case 'heading':
					html += buildHeading(el);
					break;
				case 'list':
					html += buildList(el);
					break;
				case 'list-item':
					html += buildListItem(el);
					break;
				case 'link':
					html += buildLink(el);
					break;
				case 'text':
					html += buildText(el);
					break;
				default:
					break;
			}
		}
	}

	return html;
}

function buildParagraph(el: Element): string {
	if (el?.children) {
		return `<p>${convertSchemaToHtml(el.children)}</p>`;
	}
	return '';
}

function buildHeading(el: Element): string {
	if (el?.children && el?.level) {
		return `<h${el.level}>${convertSchemaToHtml(el.children)}</h${el.level}>`;
	}
	return '';
}

function buildList(el: Element): string {
	if (el?.children) {
		if (el?.listType === 'ordered') {
			return `<ol>${convertSchemaToHtml(el.children)}</ol>`;
		} else {
			return `<ul>${convertSchemaToHtml(el.children)}</ul>`;
		}
	}
	return '';
}

function buildListItem(el: Element): string {
	if (el?.children) {
		return `<li>${convertSchemaToHtml(el.children)}</li>`;
	}
	return '';
}

function buildLink(el: Element): string {
	const url = el?.url || '#';
	const title = el?.title || '';
	const target = el?.target || '';
	return `<a href="${url}" title="${title}" target="${target}">${convertSchemaToHtml(el?.children)}</a>`;
}

function buildText(el: Element): string {
	const value = el?.value || '';
	if (el?.bold) {
		return `<strong>${value}</strong>`;
	}
	if (el?.italic) {
		return `<em>${value}</em>`;
	}
	return value;
}

/**
 * Extract plain text from rich text JSON
 */
function getOnlyText(element: Element): string {
	if (element.type === 'text') {
		return element.value || '';
	} else if (element.children?.length) {
		// Inline nodes carry their own spacing; only block siblings need a separator
		return element.children.map(getOnlyText).join(element.type === 'root' ? ' ' : '');
	}
	return '';
}

/**
 * Convert plain text to Shopify rich text JSON (one paragraph per blank-line-
 * separated block). Inverse of convertSchemaToText for unformatted content.
 */
export function convertTextToSchema(text: string): string {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => ({
			type: 'paragraph',
			children: [{ type: 'text', value: p.replace(/\s*\n\s*/g, ' ') }]
		}));

	return JSON.stringify({ type: 'root', children: paragraphs });
}

/**
 * Convert Shopify rich text JSON to plain text with paragraphs separated by
 * blank lines — suitable for editing in a textarea.
 */
export function convertSchemaToParagraphs(rich?: string | null): string {
	if (!rich) return '';
	try {
		const data = JSON.parse(rich) as Element;
		const blocks = data.type === 'root' ? (data.children ?? []) : [data];
		return blocks
			.map(getOnlyText)
			.map((p) => p.trim())
			.filter(Boolean)
			.join('\n\n');
	} catch (e) {
		console.error('Failed to parse rich text:', e);
		return '';
	}
}

/**
 * Re-encode plain text as rich text JSON, but keep the existing rich text
 * (with its formatting) when the text content is unchanged.
 */
export function updateRichText(existing: string | null | undefined, text: string): string | null {
	if (!text.trim()) return null;
	if (existing && convertSchemaToParagraphs(existing) === convertSchemaToParagraphs(convertTextToSchema(text))) {
		return existing;
	}
	return convertTextToSchema(text);
}

/**
 * Convert Shopify rich text JSON to plain text
 */
export function convertSchemaToText(rich?: string | null): string {
	if (rich) {
		try {
			const data = JSON.parse(rich) as Element;
			return getOnlyText(data);
		} catch (e) {
			console.error('Failed to parse rich text:', e);
			return '';
		}
	}
	return '';
}
