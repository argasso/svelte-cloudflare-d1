<script lang="ts">
	import { mediaImage, mediaSource } from '$lib/utils/image';
	import { convertSchemaToHtml } from '$lib/utils/richtext';
	import { textExcerpt } from '$lib/utils';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();

	// Author bio is Shopify rich-text JSON.
	const bioHtml = $derived.by(() => {
		const raw = (data.author.fields as { description?: unknown } | null)?.description;
		if (!raw) return '';
		try {
			return convertSchemaToHtml(typeof raw === 'string' ? JSON.parse(raw) : raw);
		} catch {
			return '';
		}
	});

	const metaDescription = $derived(
		textExcerpt(bioHtml) || `Böcker av ${data.author.title} på Argasso bokförlag.`
	);
</script>

<Seo
	title={data.author.title ?? 'Författare'}
	description={metaDescription}
	image={mediaSource(data.portrait)}
	type="article"
/>

<div class="container mx-auto px-4 py-8">
	<a href="/forfattare" class="text-sm text-muted-foreground hover:underline">← Alla författare</a>

	<div class="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
		{#if data.portrait}
			<img
				src={mediaImage(data.portrait, 'card', data.imageTransforms)}
				alt={data.portrait.altText ?? data.author.title}
				class="aspect-square w-48 shrink-0 rounded-lg object-cover"
			/>
		{/if}
		<div>
			<h1 class="text-4xl font-bold">{data.author.title}</h1>
			{#if bioHtml}
				<div class="prose mt-4 max-w-none">
					{@html bioHtml}
				</div>
			{/if}
		</div>
	</div>

	{#if data.books.length > 0}
		<div class="mt-10">
			<h2 class="mb-6 text-2xl font-bold">Böcker av {data.author.title}</h2>
			<div class="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
				{#each data.books as book (book.id)}
					<a href="/bok/{book.handle}" class="group block">
						<div
							class="aspect-[3/4] overflow-hidden rounded-lg bg-muted flex items-center justify-center transition group-hover:opacity-90"
						>
							{#if book.cover}
								<img
									src={mediaImage(book.cover, 'card', data.imageTransforms)}
									alt={book.cover.altText ?? book.title}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<span class="text-xs text-muted-foreground">Book Cover</span>
							{/if}
						</div>
						<h3 class="mt-2 font-semibold line-clamp-2 group-hover:underline">{book.title}</h3>
						{#if book.price != null}
							<p class="text-sm font-bold">{book.priceFrom ? 'Från ' : ''}{book.price} SEK</p>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
