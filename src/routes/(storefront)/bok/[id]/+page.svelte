<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { mediaImage } from '$lib/utils/image';
	import type { Metafield, Variant } from '$lib/db/schema';

	let { data } = $props();

	// null = use the default (first) variant; reset implicitly when navigating to
	// another book since a stale gid won't match the new product's variants.
	let chosenVariantId = $state<string | null>(null);
	// An explicit thumbnail click overrides the variant's own image.
	let pickedImageId = $state<number | null>(null);

	const selectedVariant = $derived(
		data.product.variants.find((v) => v.id === chosenVariantId) ?? data.product.variants[0]
	);
	const selectedVariantId = $derived(selectedVariant?.id ?? null);

	// Main image: explicit pick → the selected variant's image → first product image.
	const mainImage = $derived(
		(pickedImageId != null ? data.media.find((m) => m.id === pickedImageId) : null) ??
			(selectedVariant?.imageId != null
				? data.media.find((m) => m.id === selectedVariant.imageId)
				: null) ??
			data.media[0] ??
			null
	);

	function selectVariant(id: string) {
		chosenVariantId = id;
		pickedImageId = null; // follow the variant's image again
	}

	function metafield(
		variant: Variant & { metafields: Metafield[] },
		namespace: string,
		key: string
	): string {
		return variant.metafields?.find((m) => m.namespace === namespace && m.key === key)?.value ?? '';
	}

	const details = $derived(
		selectedVariant
			? [
					{ label: 'Bindning', value: metafield(selectedVariant, 'book', 'binding') },
					{ label: 'Sidor', value: metafield(selectedVariant, 'book', 'number_of_pages') },
					{ label: 'Ålder', value: metafield(selectedVariant, 'book', 'age') },
					{ label: 'ISBN', value: selectedVariant.sku ?? '' }
				].filter((d) => d.value)
			: []
	);
</script>

<div class="container mx-auto px-4 py-8">
	<a href="/bocker" class="text-sm text-muted-foreground hover:underline">← Alla böcker</a>

	<div class="mt-6 grid gap-8 md:grid-cols-2">
		<!-- Images -->
		<div>
			<div class="aspect-[3/4] overflow-hidden rounded-lg bg-muted">
				{#if mainImage}
					<img
						src={mediaImage(mainImage, 'detail', data.imageTransforms)}
						alt={mainImage.altText ?? data.product.title}
						class="h-full w-full object-cover"
					/>
				{:else}
					<div class="flex h-full items-center justify-center text-muted-foreground">
						Ingen bild
					</div>
				{/if}
			</div>

			{#if data.media.length > 1}
				<div class="mt-3 flex flex-wrap gap-2">
					{#each data.media as image (image.id)}
						<button
							type="button"
							onclick={() => (pickedImageId = image.id)}
							class="h-16 w-16 overflow-hidden rounded-md border {mainImage?.id === image.id
								? 'ring-2 ring-primary'
								: ''}"
						>
							<img
								src={mediaImage(image, 'thumb', data.imageTransforms)}
								alt={image.altText ?? ''}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Details -->
		<div>
			<h1 class="text-3xl font-bold">{data.product.title}</h1>

			{#if data.authors.length > 0}
				<p class="mt-2 text-muted-foreground">
					av
					{#each data.authors as author, i (author.id)}
						<a href="/forfattare/{author.handle}" class="hover:underline">{author.title}</a
						>{i < data.authors.length - 1 ? ', ' : ''}
					{/each}
				</p>
			{/if}

			<!-- Format / variant selector -->
			{#if data.product.variants.length > 1}
				<div class="mt-4 flex flex-wrap gap-2">
					{#each data.product.variants as variant (variant.id)}
						<Button
							variant={variant.id === selectedVariantId ? 'default' : 'outline'}
							size="sm"
							onclick={() => selectVariant(variant.id)}
						>
							{variant.title}
						</Button>
					{/each}
				</div>
			{/if}

			{#if selectedVariant}
				<p class="mt-4 text-2xl font-bold">{selectedVariant.price} SEK</p>
			{/if}

			{#if data.product.description}
				<div class="prose mt-6 max-w-none text-sm">
					{@html data.product.description}
				</div>
			{/if}

			{#if details.length > 0}
				<dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					{#each details as d (d.label)}
						<dt class="text-muted-foreground">{d.label}</dt>
						<dd>{d.value}</dd>
					{/each}
				</dl>
			{/if}
		</div>
	</div>
</div>
