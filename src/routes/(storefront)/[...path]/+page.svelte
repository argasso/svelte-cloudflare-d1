<script lang="ts">
	import { convertSchemaToHtml } from '$lib/utils/richtext';
	import { textExcerpt } from '$lib/utils';
	import FilteredBookListing from '$lib/components/FilteredBookListing.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import JsonLd from '$lib/components/JsonLd.svelte';
	import { page as pageStore } from '$app/stores';

	let { data } = $props();

	const seoTitle = $derived(
		(data.page.fields as { meta_title_seo?: string } | null)?.meta_title_seo || null
	);

	const breadcrumbLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Hem', item: $pageStore.url.origin + '/' },
			...data.breadcrumb.map((c, i) => ({
				'@type': 'ListItem',
				position: i + 2,
				name: c.label,
				item: $pageStore.url.origin + c.href
			}))
		]
	});

	// Page content is Shopify rich-text JSON; render it to HTML.
	const contentHtml = $derived.by(() => {
		const raw = (data.page.fields as { content?: unknown } | null)?.content;
		if (!raw) return '';
		try {
			return convertSchemaToHtml(typeof raw === 'string' ? JSON.parse(raw) : raw);
		} catch {
			return '';
		}
	});

	// Prefer the page's hand-written SEO description, else an excerpt of content.
	const metaDescription = $derived(
		(data.page.fields as { meta_description_seo?: string } | null)?.meta_description_seo ||
			textExcerpt(contentHtml)
	);
</script>

<Seo
	title={data.page.title ?? data.page.handle}
	fullTitle={seoTitle}
	description={metaDescription}
/>
<JsonLd data={breadcrumbLd} />

<div class="container mx-auto px-4 py-8">
	<!-- Breadcrumb -->
	<nav class="mb-4 text-sm text-muted-foreground">
		<a href="/" class="hover:underline">Hem</a>
		{#each data.breadcrumb as crumb, i (crumb.href)}
			<span class="mx-1">/</span>
			{#if i === data.breadcrumb.length - 1}
				<span class="text-foreground">{crumb.label}</span>
			{:else}
				<a href={crumb.href} class="hover:underline">{crumb.label}</a>
			{/if}
		{/each}
	</nav>

	<h1 class="text-4xl font-bold">{data.page.title}</h1>

	{#if contentHtml}
		<div class="prose mt-6 max-w-none">
			{@html contentHtml}
		</div>
	{/if}

	<!-- Sub-pages (child categories) -->
	{#if data.children.length > 0}
		<div class="mt-8 flex flex-wrap gap-2">
			{#each data.children as child (child.id)}
				<a
					href={child.href}
					class="rounded-md border px-4 py-2 text-sm hover:bg-accent">{child.title}</a
				>
			{/each}
		</div>
	{/if}

	<!-- Books linked to this page (with the same filters as /bocker) -->
	{#if data.hasBooks}
		<div class="mt-10">
			<h2 class="mb-6 text-2xl font-bold">Böcker</h2>
			<FilteredBookListing
				facets={data.facets}
				sort={data.sort}
				products={data.products}
				total={data.total}
				page={data.pageNum}
				totalPages={data.totalPages}
				imageTransforms={data.imageTransforms}
			/>
		</div>
	{/if}
</div>
