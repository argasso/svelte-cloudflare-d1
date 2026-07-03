<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let {
		sortOptions = [],
		placeholder = 'Sök…'
	}: { sortOptions?: { value: string; label: string }[]; placeholder?: string } = $props();

	const base = $derived($page.url.pathname);
	// Seeded from the URL, re-seeded on navigation (focus kept by client nav).
	let q = $state($page.url.searchParams.get('q') ?? '');
	$effect(() => {
		q = $page.url.searchParams.get('q') ?? '';
	});
	const sort = $derived($page.url.searchParams.get('sort') ?? sortOptions[0]?.value ?? '');
	const hasQuery = $derived(!!$page.url.searchParams.get('q'));

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const sp = new URLSearchParams();
		for (const [k, v] of new FormData(e.currentTarget as HTMLFormElement)) {
			if (typeof v === 'string' && v !== '') sp.append(k, v);
		}
		const qs = sp.toString();
		goto(qs ? `${base}?${qs}` : base, { keepFocus: true, noScroll: true });
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onInput(e: Event) {
		const form = (e.currentTarget as HTMLElement).closest('form');
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), 300);
	}
	function submitNow(e: Event) {
		(e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}
</script>

<form method="GET" onsubmit={onSubmit} class="flex flex-wrap items-center gap-2">
	<input
		type="search"
		name="q"
		bind:value={q}
		oninput={onInput}
		{placeholder}
		class="h-9 w-64 max-w-full rounded-md border border-input bg-background px-3 text-sm"
		aria-label="Sök"
	/>
	{#if sortOptions.length > 0}
		<select
			name="sort"
			value={sort}
			onchange={submitNow}
			class="h-9 rounded-md border border-input bg-background px-2 text-sm"
		>
			{#each sortOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	{/if}
	{#if hasQuery}
		<a href={base} class="text-sm text-muted-foreground hover:underline">Rensa</a>
	{/if}
</form>
