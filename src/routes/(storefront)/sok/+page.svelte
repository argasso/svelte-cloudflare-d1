<script lang="ts">
	import { mediaImage } from '$lib/utils/image';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();
</script>

<Seo title={data.q ? `Sök: ${data.q}` : 'Sök'} noindex />

<div class="container mx-auto px-4 py-8">
	<h1 class="text-3xl font-bold">Sök</h1>

	<!-- Search box (also in the header; repeated here for the mobile icon entry) -->
	<form action="/sok" role="search" class="mt-4 max-w-xl">
		<input
			name="q"
			type="search"
			value={data.q}
			placeholder="Sök böcker, författare, sidor…"
			aria-label="Sök"
			class="h-11 w-full rounded-md border bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring"
		/>
	</form>

	{#if data.q && data.total === 0}
		<p class="mt-8 text-muted-foreground">
			Inga träffar för ”{data.q}”. Prova ett annat sökord.
		</p>
	{:else if !data.q}
		<p class="mt-8 text-muted-foreground">Skriv något att söka efter.</p>
	{/if}

	<!-- Böcker -->
	{#if data.books.length > 0}
		<section class="mt-10">
			<div class="mb-6 flex items-baseline justify-between gap-4">
				<h2 class="text-2xl font-bold">Böcker</h2>
				<a href="/bocker?q={encodeURIComponent(data.q)}" class="text-sm hover:underline">
					Visa alla i boklistan →
				</a>
			</div>
			<div class="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
				{#each data.books as book (book.id)}
					<a href="/bok/{book.handle}" class="group block">
						<div
							class="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-muted transition group-hover:opacity-90"
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
						<h3 class="mt-2 line-clamp-2 font-semibold group-hover:underline">{book.title}</h3>
						{#if book.price != null}
							<p class="text-sm font-bold">{book.priceFrom ? 'Från ' : ''}{book.price} SEK</p>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Författare -->
	{#if data.authors.length > 0}
		<section class="mt-10">
			<h2 class="mb-6 text-2xl font-bold">Författare</h2>
			<div class="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
				{#each data.authors as author (author.id)}
					<a href="/forfattare/{author.handle}" class="group flex items-center gap-3">
						<div
							class="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center"
						>
							{#if author.cover}
								<img
									src={mediaImage(author.cover, 'thumb', data.imageTransforms)}
									alt={author.cover.altText ?? author.title}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{/if}
						</div>
						<span class="font-semibold group-hover:underline">{author.title}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Sidor -->
	{#if data.pages.length > 0}
		<section class="mt-10">
			<h2 class="mb-6 text-2xl font-bold">Sidor</h2>
			<ul class="space-y-2">
				{#each data.pages as p (p.id)}
					<li>
						<a href="/{p.handle}" class="hover:underline">{p.title}</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
