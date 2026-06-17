<script lang="ts">
	import { mediaImage } from '$lib/utils/image';
	import { convertSchemaToHtml } from '$lib/utils/richtext';
	import Pagination from '$lib/components/Pagination.svelte';

	let { data } = $props();

	const hrefFor = (p: number) =>
		p === 1 ? `/${data.page.handle}` : `/${data.page.handle}?page=${p}`;

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
</script>

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

	<!-- Books linked to this page -->
	{#if data.products.length > 0}
		<div class="mt-10">
			<h2 class="mb-6 text-2xl font-bold">Böcker</h2>
			<div class="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{#each data.products as product (product.id)}
					<a href="/bok/{product.id}" class="group block">
						<div
							class="aspect-[3/4] overflow-hidden rounded-lg bg-muted flex items-center justify-center transition group-hover:opacity-90"
						>
							{#if product.cover}
								<img
									src={mediaImage(product.cover, 'card')}
									alt={product.cover.altText ?? product.title}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<span class="text-xs text-muted-foreground">Book Cover</span>
							{/if}
						</div>
						<h3 class="mt-2 font-semibold line-clamp-2 group-hover:underline">{product.title}</h3>
						{#if product.price}
							<p class="text-sm font-bold">{product.price} SEK</p>
						{/if}
					</a>
				{/each}
			</div>
			<Pagination page={data.pageNum} totalPages={data.totalPages} {hrefFor} />
		</div>
	{/if}
</div>
