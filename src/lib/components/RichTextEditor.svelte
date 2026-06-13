<script lang="ts">
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import type { Attachment } from 'svelte/attachments';
	import { shopifyToTiptap, tiptapToShopify, type ShopifyRichText } from '$lib/utils/tiptap';

	interface Props {
		/** Form field name; a hidden input submits the serialized value */
		name: string;
		/** Existing value: Shopify rich text JSON string (json) or HTML (html) */
		value?: string | null;
		/**
		 * Storage format. 'json' for Shopify metaobject rich-text fields,
		 * 'html' for Shopify product descriptions (descriptionHtml).
		 */
		format?: 'json' | 'html';
		/** Associate the hidden input with a form by id (for inputs outside the form) */
		form?: string;
		placeholder?: string;
	}

	let { name, value = null, format = 'json', form, placeholder }: Props = $props();

	function parseInitial(json: string | null): ShopifyRichText | null {
		if (!json) return null;
		try {
			return JSON.parse(json) as ShopifyRichText;
		} catch {
			return null;
		}
	}

	function serialize(ed: Editor): string {
		return format === 'html' ? ed.getHTML() : JSON.stringify(tiptapToShopify(ed.getJSON() as never));
	}

	let editor = $state<Editor>();
	let version = $state(0); // bumped on every transaction to refresh toolbar state
	// serialized Shopify JSON for the hidden input; set by the attachment on mount
	let current = $state('');

	let linkOpen = $state(false);
	let linkUrl = $state('');

	const mountEditor: Attachment = (element) => {
		const ed = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					// Shopify rich text can't store these, so don't let the editor produce them
					strike: false,
					code: false,
					codeBlock: false,
					blockquote: false,
					horizontalRule: false,
					// json (metaobject) format has no line-break node; html (product) keeps it
					...(format === 'json' ? { hardBreak: false as const } : {}),
					heading: { levels: [2, 3, 4] },
					link: { openOnClick: false, autolink: true }
				})
			],
			content: format === 'html' ? (value ?? '') : shopifyToTiptap(parseInitial(value)),
			onTransaction: () => {
				version++;
			},
			onUpdate: ({ editor: e }) => {
				current = serialize(e);
			}
		});
		editor = ed;
		current = serialize(ed);
		return () => {
			ed.destroy();
			editor = undefined;
		};
	};

	// Toolbar active state; re-derives whenever a transaction bumps `version`
	let active = $derived.by(() => {
		version;
		return {
			bold: editor?.isActive('bold') ?? false,
			italic: editor?.isActive('italic') ?? false,
			h2: editor?.isActive('heading', { level: 2 }) ?? false,
			h3: editor?.isActive('heading', { level: 3 }) ?? false,
			h4: editor?.isActive('heading', { level: 4 }) ?? false,
			bullet: editor?.isActive('bulletList') ?? false,
			ordered: editor?.isActive('orderedList') ?? false,
			link: editor?.isActive('link') ?? false
		};
	});

	function openLink() {
		linkUrl = editor?.getAttributes('link').href ?? '';
		linkOpen = true;
	}

	function applyLink() {
		const url = linkUrl.trim();
		const chain = editor?.chain().focus().extendMarkRange('link');
		if (!url) {
			chain?.unsetLink().run();
		} else {
			chain?.setLink({ href: url }).run();
		}
		linkOpen = false;
		linkUrl = '';
	}
</script>

<div class="rounded-md border border-input bg-background">
	<div class="flex flex-wrap items-center gap-1 border-b border-input p-1">
		{#snippet tb(label: string, isActive: boolean, onclick: () => void, title: string)}
			<button
				type="button"
				{title}
				{onclick}
				class="rounded px-2 py-1 text-sm hover:bg-accent {isActive
					? 'bg-accent font-semibold'
					: ''}"
			>
				{label}
			</button>
		{/snippet}

		{@render tb('B', active.bold, () => editor?.chain().focus().toggleBold().run(), 'Bold')}
		{@render tb('I', active.italic, () => editor?.chain().focus().toggleItalic().run(), 'Italic')}
		<span class="mx-1 h-5 w-px bg-border"></span>
		{@render tb('H2', active.h2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2')}
		{@render tb('H3', active.h3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3')}
		{@render tb('H4', active.h4, () => editor?.chain().focus().toggleHeading({ level: 4 }).run(), 'Heading 4')}
		<span class="mx-1 h-5 w-px bg-border"></span>
		{@render tb('• List', active.bullet, () => editor?.chain().focus().toggleBulletList().run(), 'Bullet list')}
		{@render tb('1. List', active.ordered, () => editor?.chain().focus().toggleOrderedList().run(), 'Numbered list')}
		<span class="mx-1 h-5 w-px bg-border"></span>
		{@render tb('Link', active.link, openLink, 'Add or edit link')}
	</div>

	{#if linkOpen}
		<div class="flex items-center gap-2 border-b border-input p-2">
			<input
				type="url"
				bind:value={linkUrl}
				placeholder="https://… or mailto:…"
				class="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						applyLink();
					}
				}}
			/>
			<button type="button" onclick={applyLink} class="rounded px-2 py-1 text-sm hover:bg-accent">
				Apply
			</button>
			<button
				type="button"
				onclick={() => {
					linkOpen = false;
					linkUrl = '';
				}}
				class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
			>
				Cancel
			</button>
		</div>
	{/if}

	<div {@attach mountEditor} class="tiptap-host" data-placeholder={placeholder}></div>
	<input type="hidden" {name} {form} value={current} />
</div>

<style>
	.tiptap-host :global(.tiptap) {
		min-height: 10rem;
		padding: 0.75rem;
		outline: none;
	}
	.tiptap-host :global(.tiptap p) {
		margin: 0 0 0.75rem;
	}
	.tiptap-host :global(.tiptap h2) {
		font-size: 1.4rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}
	.tiptap-host :global(.tiptap h3) {
		font-size: 1.2rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}
	.tiptap-host :global(.tiptap h4) {
		font-size: 1.05rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}
	.tiptap-host :global(.tiptap ul) {
		list-style: disc;
		padding-left: 1.5rem;
		margin: 0 0 0.75rem;
	}
	.tiptap-host :global(.tiptap ol) {
		list-style: decimal;
		padding-left: 1.5rem;
		margin: 0 0 0.75rem;
	}
	.tiptap-host :global(.tiptap a) {
		color: var(--color-primary, #2563eb);
		text-decoration: underline;
	}
</style>
