<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Pill from '$lib/components/Pill.svelte';
	import { mediaImage } from '$lib/utils/image';

	let { data } = $props();
</script>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="text-4xl font-bold mb-4">Alla böcker</h1>
		<p class="text-muted-foreground">Browse vårt hela sortiment av {data.products.length} böcker</p>
	</div>

	<!-- Category filters -->
	{#if data.categories.length > 0}
		<div class="mb-8 flex flex-wrap gap-2">
			<Button variant="outline" href="/bocker">Alla</Button>
			{#each data.categories as category}
				<Button variant="outline" href="/bocker/{category.handle}">
					{category.title}
				</Button>
			{/each}
		</div>
	{/if}

	<!-- Products Grid -->
	<div class="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
		{#each data.products as product}
			<div class="group">
				<a href="/bok/{product.id}" class="block">
					<div
						class="aspect-[3/4] bg-muted rounded-lg mb-3 overflow-hidden flex items-center justify-center group-hover:opacity-90 transition"
					>
						{#if product.cover}
							<img
								src={mediaImage(product.cover, 'card')}
								alt={product.cover.altText ?? product.title}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else}
							<span class="text-muted-foreground text-xs">Book Cover</span>
						{/if}
					</div>

					<h3 class="font-semibold mb-1 group-hover:underline line-clamp-2">
						{product.title}
					</h3>

					{#if product.isbn}
						<p class="text-xs text-muted-foreground font-mono mb-2">ISBN: {product.isbn}</p>
					{/if}

					{#if product.price}
						<p class="text-sm font-bold">{product.price} SEK</p>
					{/if}
				</a>
			</div>
		{/each}
	</div>

	{#if data.products.length === 0}
		<div class="text-center py-12">
			<p class="text-muted-foreground">Inga böcker hittades</p>
		</div>
	{/if}
</div>
