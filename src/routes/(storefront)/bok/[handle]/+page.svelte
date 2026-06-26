<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { mediaImage, mediaSource } from '$lib/utils/image';
	import { textExcerpt } from '$lib/utils';
	import Seo from '$lib/components/Seo.svelte';
	import JsonLd from '$lib/components/JsonLd.svelte';
	import { page as pageStore } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { addToCart } from '../../cart.remote';
	import type { Metafield, Variant } from '$lib/db/schema';

	let { data } = $props();

	let adding = $state(false);
	async function add() {
		if (!selectedVariant) return;
		adding = true;
		await addToCart({ variantId: selectedVariant.id });
		await invalidateAll(); // refresh the header cart badge
		adding = false;
	}

	const metaDescription = $derived(data.product.seoDescription || textExcerpt(data.product.description));
	const coverSource = $derived(mediaSource(data.media[0]));

	// Product structured data (rich results).
	const jsonLd = $derived.by(() => {
		const prices = data.product.variants
			.map((v) => v.price)
			.filter((p): p is number => p != null);
		const absImage = coverSource
			? coverSource.startsWith('http')
				? coverSource
				: $pageStore.url.origin + coverSource
			: undefined;
		const ld: Record<string, unknown> = {
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: data.product.title,
			description: metaDescription,
			...(absImage ? { image: [absImage] } : {}),
			...(data.authors.length
				? { author: data.authors.map((a) => ({ '@type': 'Person', name: a.title })) }
				: {})
		};
		if (prices.length) {
			ld.offers =
				prices.length > 1
					? {
							'@type': 'AggregateOffer',
							priceCurrency: 'SEK',
							lowPrice: Math.min(...prices),
							highPrice: Math.max(...prices)
						}
					: { '@type': 'Offer', priceCurrency: 'SEK', price: prices[0] };
		}
		return ld;
	});

	const breadcrumbLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Hem', item: $pageStore.url.origin + '/' },
			{
				'@type': 'ListItem',
				position: 2,
				name: 'Alla böcker',
				item: $pageStore.url.origin + '/bocker'
			},
			{
				'@type': 'ListItem',
				position: 3,
				name: data.product.title,
				item: `${$pageStore.url.origin}/bok/${data.product.handle}`
			}
		]
	});

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

	// List metafields (e.g. illustrations_by) store a JSON array — show "A, B".
	function metafieldList(
		variant: Variant & { metafields: Metafield[] },
		namespace: string,
		key: string
	): string {
		const raw = metafield(variant, namespace, key);
		if (!raw) return '';
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr)) return arr.filter(Boolean).join(', ');
		} catch {
			/* not JSON — fall through */
		}
		return raw;
	}

	// book.discontinued is a boolean metafield ("true"/"false"); out of print.
	const discontinued = $derived(
		selectedVariant ? metafield(selectedVariant, 'book', 'discontinued') === 'true' : false
	);

	// publish_month is stored as an ISO date (e.g. "2010-05-01"); show "maj 2010".
	function publishMonth(value: string): string {
		if (!value) return '';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return value;
		return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
	}

	const details = $derived(
		selectedVariant
			? [
					{ label: 'Format', value: metafield(selectedVariant, 'book', 'binding') },
					{ label: 'Rekommenderad ålder', value: metafield(selectedVariant, 'book', 'age') },
					{ label: 'Antal sidor', value: metafield(selectedVariant, 'book', 'number_of_pages') },
					{ label: 'Lättlästnivå', value: metafield(selectedVariant, 'book', 'reading_level') },
					{ label: 'Speltid', value: metafield(selectedVariant, 'audio_book', 'duration') },
					{ label: 'Uppläsare', value: metafield(selectedVariant, 'audio_book', 'narrated_by') },
					{
						label: 'Utgivningsmånad',
						value: publishMonth(metafield(selectedVariant, 'book', 'publish_month'))
					},
					{ label: 'Originaltitel', value: metafield(selectedVariant, 'translated_book', 'original_title') },
					{ label: 'Översättning', value: metafield(selectedVariant, 'translated_book', 'translated_by') },
					{ label: 'Illustratör', value: metafieldList(selectedVariant, 'book', 'illustrations_by') },
					{ label: 'Redigerad av', value: metafieldList(selectedVariant, 'book', 'edited_by') },
					{ label: 'ISBN', value: selectedVariant.barcode || selectedVariant.sku || '' }
				].filter((d) => d.value)
			: []
	);
</script>

<Seo
	title={data.product.title}
	fullTitle={data.product.seoTitle}
	description={metaDescription}
	image={coverSource}
	type="product"
/>
<JsonLd data={jsonLd} />
<JsonLd data={breadcrumbLd} />

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
				<p class="mt-4 text-2xl font-bold">{selectedVariant.price} kr</p>
				{#if discontinued}
					<div class="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
						Den här utgåvan är utgången och säljs inte längre.
					</div>
				{:else if data.commerceEnabled}
					<Button class="mt-3" disabled={adding} onclick={add}>
						{adding ? 'Lägger till…' : 'Lägg i varukorg'}
					</Button>
				{/if}
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
