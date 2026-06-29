<script lang="ts">
	import { PARAM, type Facets } from '$lib/book-filters';

	let { facets }: { facets: Facets } = $props();

	// Auto-submit the surrounding GET form on any change (progressive: still works
	// via the "Filtrera" button without JS). Submitting drops the page param, so
	// changing a filter resets to page 1.
	function submit(e: Event) {
		(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

	const groups = $derived([
		{ name: PARAM.binding, label: 'Format', options: facets.binding },
		{ name: PARAM.age, label: 'Rekommenderad ålder', options: facets.age },
		{ name: PARAM.level, label: 'Lättlästnivå', options: facets.level },
		{ name: PARAM.author, label: 'Författare', options: facets.author },
		{ name: PARAM.discontinued, label: 'Utgått', options: facets.discontinued }
	]);
</script>

<div class="space-y-4 text-sm">
	<!-- Pris -->
	<details open class="border-b pb-3">
		<summary class="cursor-pointer font-semibold">Pris (kr)</summary>
		<div class="mt-3 flex items-center gap-2">
			<input
				type="number"
				name={PARAM.priceMin}
				inputmode="numeric"
				min="0"
				placeholder={String(facets.price.min)}
				value={facets.price.selectedMin ?? ''}
				onchange={submit}
				class="h-9 w-full rounded-md border border-input bg-background px-2"
				aria-label="Lägsta pris"
			/>
			<span class="text-muted-foreground">–</span>
			<input
				type="number"
				name={PARAM.priceMax}
				inputmode="numeric"
				min="0"
				placeholder={String(facets.price.max)}
				value={facets.price.selectedMax ?? ''}
				onchange={submit}
				class="h-9 w-full rounded-md border border-input bg-background px-2"
				aria-label="Högsta pris"
			/>
		</div>
	</details>

	{#each groups as group (group.name)}
		{#if group.options.length > 0}
			<details open class="border-b pb-3">
				<summary class="cursor-pointer font-semibold">{group.label}</summary>
				<ul class="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
					{#each group.options as opt (opt.value)}
						<li>
							<label class="flex items-center gap-2 {opt.count === 0 ? 'text-muted-foreground' : ''}">
								<input
									type="checkbox"
									name={group.name}
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
		<button type="submit" class="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground"
			>Filtrera</button
		>
	</noscript>
</div>
