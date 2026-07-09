<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { mediaImage } from '$lib/utils/image';
	import { textExcerpt } from '$lib/utils';
	import Seo from '$lib/components/Seo.svelte';
	import JsonLd from '$lib/components/JsonLd.svelte';
	import { page as pageStore } from '$app/stores';

	let { data } = $props();

	const orgLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Argasso bokförlag',
		url: $pageStore.url.origin
	});

	// publish_month arrives as ISO "YYYY-MM-01" from the book metafield.
	function fmtMonth(value: string | null | undefined) {
		if (!value) return '';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return value;
		return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
	}

	// Intro: prefer the admin-authored short description, else an excerpt.
	function intro(book: { descriptionShort: string | null; description: string | null }) {
		return book.descriptionShort?.trim() || textExcerpt(book.description, 180);
	}
</script>

<Seo
	title=""
	description="Argasso bokförlag ger ut lättlästa böcker för barn och ungdomar — för läslust i alla åldrar."
/>
<JsonLd data={orgLd} />

<div class="container mx-auto px-4 py-12">
	<!-- Hero Section -->
	<div class="mb-16 text-center">
		<h1 class="mb-4 text-5xl font-bold">Välkommen till Argasso bokförlag</h1>
		<h2 class="mb-8 text-2xl text-muted-foreground">Lättlästa böcker för barn och ungdomar</h2>
		<Button href="/bocker" size="lg">Se alla våra böcker</Button>
	</div>

	{#snippet section(heading: string, books: typeof data.nyheter)}
		{#if books.length > 0}
			<section class="mb-16">
				<h2 class="mb-6 text-3xl font-bold">{heading}</h2>
				<div class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
					{#each books as book (book.id)}
						<article class="grid grid-cols-[4.5rem_1fr] gap-3 sm:grid-cols-[5.5rem_1fr]">
							<a
								href="/bok/{book.handle}"
								class="block aspect-[3/4] overflow-hidden rounded-md bg-muted"
							>
								{#if book.cover}
									<img
										src={mediaImage(book.cover, 'card', data.imageTransforms)}
										alt={book.cover.altText ?? book.title}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{/if}
							</a>
							<div class="flex min-w-0 flex-col">
								<h3 class="text-sm font-bold leading-snug sm:text-base">
									<a href="/bok/{book.handle}" class="hover:underline">{book.title}</a>
								</h3>
								{#if intro(book)}
									<p class="mt-1 hidden text-sm text-muted-foreground sm:line-clamp-3">
										{intro(book)}
									</p>
								{/if}
								{#if book.publishMonth}
									<p class="mt-auto pt-2 text-xs uppercase tracking-wide text-muted-foreground">
										{fmtMonth(book.publishMonth)}
									</p>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			</section>
		{/if}
	{/snippet}

	{@render section('Nyheter', data.nyheter)}
	{@render section('Kommande utgivning', data.kommande)}
</div>
