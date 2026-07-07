<script lang="ts">
	import { page } from '$app/stores';
	import { PARAM, type Facets } from '$lib/book-filters';
	import PriceRange from '$lib/components/PriceRange.svelte';

	// `formId` associates controls with the filter form even when this component
	// is rendered inside a portaled mobile drawer (outside the <form> in the DOM).
	let {
		facets,
		showSearch = false,
		formId
	}: { facets: Facets; showSearch?: boolean; formId?: string } = $props();

	// The form to submit to: by id when portaled, else the nearest ancestor form.
	function targetForm(el: HTMLElement): HTMLFormElement | null {
		return formId
			? (el.ownerDocument.getElementById(formId) as HTMLFormElement | null)
			: el.closest('form');
	}

	// Auto-submit on any change (progressive: still works via the no-JS button).
	// Submitting drops the page param, so changing a filter resets to page 1.
	function submit(e: Event) {
		targetForm(e.currentTarget as HTMLElement)?.requestSubmit();
	}

	// Live text search: seeded from the URL, re-seeded on navigation, debounced so
	// typing coalesces into one submit (focus is kept by the form's client nav).
	let q = $state($page.url.searchParams.get(PARAM.q) ?? '');
	$effect(() => {
		q = $page.url.searchParams.get(PARAM.q) ?? '';
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(e: Event) {
		const form = targetForm(e.currentTarget as HTMLElement);
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), 300);
	}

	// Status only applies to admin lists (storefront is Active-only → hidden).
	const showStatus = $derived(facets.status.length > 1 || facets.status.some((o) => o.selected));
	const groups = $derived([
		{ name: PARAM.binding, label: 'Format', options: facets.binding },
		{ name: PARAM.age, label: 'Rekommenderad ålder', options: facets.age },
		{ name: PARAM.level, label: 'Lättlästnivå', options: facets.level },
		{ name: PARAM.author, label: 'Författare', options: facets.author },
		{ name: PARAM.status, label: 'Status', options: showStatus ? facets.status : [] },
		{ name: PARAM.discontinued, label: 'Utgått', options: facets.discontinued }
	]);
</script>

<div class="space-y-3 text-sm">
	{#if showSearch}
		<input
			type="search"
			name={PARAM.q}
			form={formId}
			bind:value={q}
			oninput={onSearch}
			placeholder="Sök titel, författare, ISBN…"
			class="h-9 w-full rounded-md border border-input bg-background px-3"
			aria-label="Sök"
		/>
	{/if}

	<!-- Pris — collapsed by default so the list of filters is scannable -->
	<details class="border-b pb-3">
		<summary class="cursor-pointer font-semibold">Pris (kr)</summary>
		<div class="mt-3">
			<PriceRange
				{formId}
				min={facets.price.min}
				max={facets.price.max}
				selectedMin={facets.price.selectedMin}
				selectedMax={facets.price.selectedMax}
				histogram={facets.price.histogram}
			/>
		</div>
	</details>

	{#each groups as group (group.name)}
		{#if group.options.length > 0}
			<details class="border-b pb-3">
				<summary class="cursor-pointer font-semibold">{group.label}</summary>
				<ul class="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
					{#each group.options as opt (opt.value)}
						<li>
							<label class="flex items-center gap-2 {opt.count === 0 ? 'text-muted-foreground' : ''}">
								<input
									type="checkbox"
									name={group.name}
									form={formId}
									value={opt.value}
									checked={opt.selected}
									onchange={submit}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<span class="flex-1">{opt.label}</span>
								<span class="text-xs text-muted-foreground">({opt.count})</span>
							</label>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/each}

	<!-- No-JS fallback / explicit apply -->
	<noscript>
		<button
			type="submit"
			form={formId}
			class="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground">Filtrera</button
		>
	</noscript>
</div>
