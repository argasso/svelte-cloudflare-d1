<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { mediaImage } from '$lib/utils/image';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title=""
	description="Argasso bokförlag ger ut lättlästa böcker för barn och ungdomar — för läslust i alla åldrar."
/>

<div class="container mx-auto px-4 py-12">
	<!-- Hero Section -->
	<div class="text-center mb-16">
		<h1 class="text-5xl font-bold mb-4">Välkommen till Argasso bokförlag</h1>
		<h2 class="text-2xl text-muted-foreground mb-8">Lättlästa böcker för barn och ungdomar</h2>
		<Button href="/bocker" size="lg">Se alla våra böcker</Button>
	</div>

	<!-- Nyheter / Recent Books -->
	<div class="mb-16">
		<h2 class="text-3xl font-bold mb-8">Nyheter</h2>
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each data.products.slice(0, 6) as product}
				<div class="group">
					<a href="/bok/{product.id}" class="block">
						<div
							class="aspect-[3/4] bg-muted rounded-lg mb-4 overflow-hidden flex items-center justify-center group-hover:opacity-90 transition"
						>
							{#if product.cover}
								<img
									src={mediaImage(product.cover, 'card', data.imageTransforms)}
									alt={product.cover.altText ?? product.title}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<span class="text-muted-foreground text-sm">Book Cover</span>
							{/if}
						</div>

						<h3 class="font-bold mb-2 group-hover:underline line-clamp-2">{product.title}</h3>

						{#if product.description}
							<div class="text-sm text-muted-foreground line-clamp-3 mb-3">
								{@html product.description}
							</div>
						{/if}

						<p class="text-xs text-muted-foreground italic">
							{new Date(product.updatedAt).toLocaleDateString('sv-SE', {
								month: 'long',
								year: 'numeric'
							})}
						</p>
					</a>
				</div>
			{/each}
		</div>
	</div>
</div>
