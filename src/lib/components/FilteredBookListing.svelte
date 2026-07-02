<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { mediaImage, type MediaSource } from '$lib/utils/image';
	import Pagination from '$lib/components/Pagination.svelte';
	import BookFilters from '$lib/components/BookFilters.svelte';
	import X from '@lucide/svelte/icons/x';
	import { page as pageStore } from '$app/stores';
	import { PARAM, type Facets, type SortKey } from '$lib/book-filters';

	type Card = {
		id: number;
		title: string | null;
		handle: string | null;
		cover: (MediaSource & { altText?: string | null }) | null;
		price: number | null;
		priceFrom: boolean;
	};

	let {
		facets,
		sort,
		products,
		total,
		page,
		totalPages,
		imageTransforms = false
	}: {
		facets: Facets;
		sort: SortKey;
		products: Card[];
		total: number;
		page: number;
		totalPages: number;
		imageTransforms?: boolean;
	} = $props();

	const SORT_LABELS: Record<string, string> = {
		'titel-asc': 'Titel A–Ö',
		'titel-desc': 'Titel Ö–A',
		'pris-asc': 'Pris (lägst först)',
		'pris-desc': 'Pris (högst först)'
	};

	// URLs stay on the current route (works on /bocker and category pages alike).
	const base = $derived($pageStore.url.pathname);

	function submitForm(e: Event) {
		(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

	function urlWith(mutate: (sp: URLSearchParams) => void): string {
		const sp = new URLSearchParams($pageStore.url.searchParams);
		mutate(sp);
		sp.delete('page'); // any filter change returns to the first page
		const qs = sp.toString();
		return qs ? `${base}?${qs}` : base;
	}
	const removeValueHref = (param: string, value: string) =>
		urlWith((sp) => {
			const kept = sp.getAll(param).filter((v) => v !== value);
			sp.delete(param);
			for (const v of kept) sp.append(param, v);
		});

	function hrefFor(p: number): string {
		const sp = new URLSearchParams($pageStore.url.searchParams);
		if (p === 1) sp.delete('page');
		else sp.set('page', String(p));
		const qs = sp.toString();
		return qs ? `${base}?${qs}` : base;
	}

	const chips = $derived.by(() => {
		const out: { label: string; href: string }[] = [];
		const groups: [string, typeof facets.binding][] = [
			[PARAM.binding, facets.binding],
			[PARAM.age, facets.age],
			[PARAM.level, facets.level],
			[PARAM.author, facets.author],
			[PARAM.discontinued, facets.discontinued]
		];
		for (const [param, options] of groups) {
			for (const opt of options) {
				if (opt.selected) out.push({ label: opt.label, href: removeValueHref(param, opt.value) });
			}
		}
		const { selectedMin, selectedMax } = facets.price;
		if (selectedMin != null || selectedMax != null) {
			out.push({
				label: `Pris ${selectedMin ?? facets.price.min}–${selectedMax ?? facets.price.max} kr`,
				href: urlWith((sp) => {
					sp.delete(PARAM.priceMin);
					sp.delete(PARAM.priceMax);
				})
			});
		}
		return out;
	});
</script>

<form method="GET" class="grid gap-8 lg:grid-cols-[16rem_1fr]">
	<!-- Sidebar: facets -->
	<aside>
		<div class="flex items-center justify-between lg:mb-3">
			<h2 class="text-lg font-semibold">Filtrera</h2>
			{#if chips.length > 0}
				<a href={base} class="text-sm text-muted-foreground hover:underline">Rensa</a>
			{/if}
		</div>
		<BookFilters {facets} />
	</aside>

	<!-- Results -->
	<div>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-muted-foreground">{total} böcker</p>
			<label class="flex items-center gap-2 text-sm">
				<span class="text-muted-foreground">Sortera</span>
				<select
					name={PARAM.sort}
					value={sort}
					onchange={submitForm}
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				>
					{#each Object.entries(SORT_LABELS) as [value, label] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if chips.length > 0}
			<div class="mb-4 flex flex-wrap gap-2">
				{#each chips as chip (chip.label)}
					<a
						href={chip.href}
						class="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm hover:bg-secondary/80"
					>
						{chip.label}
						<X class="h-3 w-3" />
					</a>
				{/each}
			</div>
		{/if}

		{#if products.length === 0}
			<div class="py-12 text-center">
				<p class="text-muted-foreground">Inga böcker matchar dina filter.</p>
				<Button href={base} variant="outline" class="mt-4">Rensa filter</Button>
			</div>
		{:else}
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each products as product (product.id)}
					<div class="group">
						<a href="/bok/{product.handle}" class="block">
							<div
								class="aspect-[3/4] bg-muted rounded-lg mb-3 overflow-hidden flex items-center justify-center group-hover:opacity-90 transition"
							>
								{#if product.cover}
									<img
										src={mediaImage(product.cover, 'card', imageTransforms)}
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

							{#if product.price != null}
								<p class="text-sm font-bold">
									{product.priceFrom ? 'Från ' : ''}{product.price} SEK
								</p>
							{/if}
						</a>
					</div>
				{/each}
			</div>

			<Pagination {page} {totalPages} {hrefFor} />
		{/if}
	</div>
</form>
