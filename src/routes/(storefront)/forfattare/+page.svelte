<script lang="ts">
	import { mediaImage } from '$lib/utils/image';

	let { data } = $props();
</script>

<div class="container mx-auto px-4 py-8">
	<h1 class="mb-8 text-4xl font-bold">Författare</h1>

	{#if data.authors.length === 0}
		<p class="text-muted-foreground">Inga författare hittades.</p>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
			{#each data.authors as author (author.id)}
				<a href="/forfattare/{author.handle}" class="group block text-center">
					<div
						class="mx-auto aspect-square w-40 overflow-hidden rounded-full bg-muted transition group-hover:opacity-90"
					>
						{#if author.cover}
							<img
								src={mediaImage(author.cover, 'thumb')}
								alt={author.cover.altText ?? author.title}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{/if}
					</div>
					<h2 class="mt-3 font-semibold group-hover:underline">{author.title}</h2>
				</a>
			{/each}
		</div>
	{/if}
</div>
