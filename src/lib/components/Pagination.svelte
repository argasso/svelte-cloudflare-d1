<script lang="ts">
	interface Props {
		page: number;
		totalPages: number;
		/** Build the href for a given page number (route-specific). */
		hrefFor: (page: number) => string;
	}

	let { page, totalPages, hrefFor }: Props = $props();

	// Windowed page list: first, last, current ±1, with gaps as null.
	const items = $derived.by<(number | null)[]>(() => {
		if (totalPages <= 1) return [];
		const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
		const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
		const out: (number | null)[] = [];
		let prev = 0;
		for (const n of nums) {
			if (n - prev > 1) out.push(null); // gap
			out.push(n);
			prev = n;
		}
		return out;
	});

	const linkClass =
		'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent';
</script>

{#if totalPages > 1}
	<nav class="mt-10 flex items-center justify-center gap-1" aria-label="Sidnavigering">
		{#if page > 1}
			<a href={hrefFor(page - 1)} class={linkClass} rel="prev">‹</a>
		{/if}

		{#each items as p, i (p ?? `gap-${i}`)}
			{#if p === null}
				<span class="px-2 text-muted-foreground">…</span>
			{:else if p === page}
				<span class="{linkClass} bg-primary text-primary-foreground" aria-current="page">{p}</span>
			{:else}
				<a href={hrefFor(p)} class={linkClass}>{p}</a>
			{/if}
		{/each}

		{#if page < totalPages}
			<a href={hrefFor(page + 1)} class={linkClass} rel="next">›</a>
		{/if}
	</nav>
{/if}
