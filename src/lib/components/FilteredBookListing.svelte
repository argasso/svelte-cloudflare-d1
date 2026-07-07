<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Drawer } from 'vaul-svelte';
	import { Button } from '$lib/components/ui/button';
	import { mediaImage, type MediaSource } from '$lib/utils/image';
	import Pagination from '$lib/components/Pagination.svelte';
	import BookFilters from '$lib/components/BookFilters.svelte';
	import X from '@lucide/svelte/icons/x';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { page as pageStore } from '$app/stores';
	import { goto } from '$app/navigation';
	import { PARAM, type Facets, type SortKey } from '$lib/book-filters';

	const FORM_ID = 'book-filter-form';

	// Below lg, the filter sidebar moves into a drawer. Rendered in exactly one
	// place at a time so form controls aren't duplicated; associated with the
	// form by id so they still submit when the drawer portals them out of it.
	let isDesktop = $state(true);
	let drawerOpen = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(min-width: 1024px)');
		const apply = () => (isDesktop = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});

	type Card = {
		id: number;
		title: string | null;
		handle: string | null;
		cover: (MediaSource & { altText?: string | null }) | null;
		price: number | null;
		priceFrom: boolean;
	};
	type SortOption = { value: SortKey; label: string };

	const STOREFRONT_SORTS: SortOption[] = [
		{ value: 'titel-asc', label: 'Titel A–Ö' },
		{ value: 'titel-desc', label: 'Titel Ö–A' },
		{ value: 'pris-asc', label: 'Pris (lägst först)' },
		{ value: 'pris-desc', label: 'Pris (högst först)' }
	];

	let {
		facets,
		sort,
		total,
		page,
		totalPages,
		products = [],
		imageTransforms = false,
		showSearch = false,
		noun = 'böcker',
		sortOptions = STOREFRONT_SORTS,
		empty: emptyProp,
		results
	}: {
		facets: Facets;
		sort: SortKey;
		total: number;
		page: number;
		totalPages: number;
		products?: Card[];
		imageTransforms?: boolean;
		showSearch?: boolean;
		noun?: string;
		sortOptions?: SortOption[];
		empty?: boolean;
		/** Custom results renderer (e.g. an admin table); default is the card grid. */
		results?: Snippet;
	} = $props();

	const isEmpty = $derived(emptyProp ?? products.length === 0);

	// URLs stay on the current route (works on /bocker, category pages and admin).
	const base = $derived($pageStore.url.pathname);

	function submitForm(e: Event) {
		(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

	// Client-side apply: keep focus (so slider/search can continue) and scroll
	// position, and drop empty controls for clean URLs. Falls back to GET without JS.
	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const sp = new URLSearchParams();
		for (const [k, v] of new FormData(e.currentTarget as HTMLFormElement)) {
			if (typeof v === 'string' && v !== '') sp.append(k, v);
		}
		const qs = sp.toString();
		goto(qs ? `${base}?${qs}` : base, { keepFocus: true, noScroll: true });
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
		const q = $pageStore.url.searchParams.get(PARAM.q);
		if (q) out.push({ label: `”${q}”`, href: urlWith((sp) => sp.delete(PARAM.q)) });
		const groups: [string, typeof facets.binding][] = [
			[PARAM.binding, facets.binding],
			[PARAM.age, facets.age],
			[PARAM.level, facets.level],
			[PARAM.author, facets.author],
			[PARAM.status, facets.status],
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

<form
	id={FORM_ID}
	method="GET"
	onsubmit={onSubmit}
	class="grid gap-8 lg:grid-cols-[16rem_1fr]"
>
	<!-- Sidebar: facets (desktop only; on mobile it's in the drawer below) -->
	{#if isDesktop}
		<aside>
			<div class="flex items-center justify-between lg:mb-3">
				<h2 class="text-lg font-semibold">Filtrera</h2>
				{#if chips.length > 0}
					<a href={base} class="text-sm text-muted-foreground hover:underline">Rensa</a>
				{/if}
			</div>
			<BookFilters {facets} {showSearch} formId={FORM_ID} />
		</aside>
	{/if}

	<!-- Results -->
	<div class="min-w-0">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				{#if !isDesktop}
					<Button type="button" variant="outline" size="sm" onclick={() => (drawerOpen = true)}>
						<SlidersHorizontal class="mr-2 h-4 w-4" />
						Filtrera{chips.length ? ` (${chips.length})` : ''}
					</Button>
				{/if}
				<p class="text-sm text-muted-foreground">{total} {noun}</p>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<span class="text-muted-foreground">Sortera</span>
				<select
					name={PARAM.sort}
					value={sort}
					onchange={submitForm}
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				>
					{#each sortOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if chips.length > 0}
			<div class="mb-4 flex flex-wrap gap-2">
				{#each chips as chip (chip.href)}
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

		{#if isEmpty}
			<div class="py-12 text-center">
				<p class="text-muted-foreground">Inga träffar.</p>
				<Button href={base} variant="outline" class="mt-4">Rensa filter</Button>
			</div>
		{:else}
			{#if results}
				{@render results()}
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
			{/if}

			<Pagination {page} {totalPages} {hrefFor} />
		{/if}
	</div>

	<!-- Mobile: the filter sidebar as a drawer (portaled; controls submit via form id) -->
	{#if !isDesktop}
		<Drawer.Root bind:open={drawerOpen} direction="bottom">
			<Drawer.Portal>
				<Drawer.Overlay class="fixed inset-0 z-50 bg-black/40" />
				<Drawer.Content
					class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl bg-background shadow-xl"
				>
					<!-- Drag handle affordance (vaul supports vertical drag-to-dismiss) -->
					<div class="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted"></div>
					<div class="flex items-center justify-between border-b px-4 py-3">
						<span class="font-semibold">Filtrera</span>
						<div class="flex items-center gap-3">
							{#if chips.length > 0}
								<a href={base} class="text-sm text-muted-foreground hover:underline">Rensa</a>
							{/if}
							<Drawer.Close class="text-muted-foreground hover:text-foreground" aria-label="Stäng">
								<X class="h-5 w-5" />
							</Drawer.Close>
						</div>
					</div>
					<div class="flex-1 overflow-y-auto p-4">
						<BookFilters {facets} {showSearch} formId={FORM_ID} />
					</div>
					<div class="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
						<Button type="button" class="w-full" onclick={() => (drawerOpen = false)}>
							Visa {total} {noun}
						</Button>
					</div>
				</Drawer.Content>
			</Drawer.Portal>
		</Drawer.Root>
	{/if}
</form>
