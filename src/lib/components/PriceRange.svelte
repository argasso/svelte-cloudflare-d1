<script lang="ts">
	import { Slider } from 'bits-ui';
	import { PARAM, type PriceBucket } from '$lib/book-filters';

	let {
		min,
		max,
		selectedMin,
		selectedMax,
		histogram
	}: {
		min: number;
		max: number;
		selectedMin: number | null;
		selectedMax: number | null;
		histogram: PriceBucket[];
	} = $props();

	// Two thumbs: [low, high]. Re-seed from props on navigation (a filter change
	// reloads the page); user drags/arrows only mutate this local copy meanwhile.
	let value = $state<number[]>([selectedMin ?? min, selectedMax ?? max]);
	$effect(() => {
		value = [selectedMin ?? min, selectedMax ?? max];
	});

	const maxCount = $derived(Math.max(1, ...histogram.map((b) => b.count)));

	// Only submit a bound when it's narrower than the full range, so an untouched
	// slider adds no query params (and shows no active-filter chip).
	const minParam = $derived(value[0] > min ? String(value[0]) : '');
	const maxParam = $derived(value[1] < max ? String(value[1]) : '');

	let root: HTMLElement;
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Debounce so holding/tapping an arrow key coalesces into one navigation.
	function commit() {
		clearTimeout(timer);
		timer = setTimeout(() => root?.closest('form')?.requestSubmit(), 400);
	}
</script>

<div bind:this={root} class="space-y-2">
	<div class="flex justify-between text-xs text-muted-foreground">
		<span>{value[0]} kr</span>
		<span>{value[1]} kr</span>
	</div>

	{#if max > min}
		<!-- Distribution bars; the in-range portion is highlighted. -->
		<div class="flex h-12 items-end gap-px" aria-hidden="true">
			{#each histogram as bucket, i (i)}
				{@const active = bucket.to > value[0] && bucket.from < value[1]}
				<div
					class="flex-1 rounded-sm {active ? 'bg-primary/60' : 'bg-muted'}"
					style="height: {bucket.count === 0 ? 4 : Math.max(8, (bucket.count / maxCount) * 100)}%"
				></div>
			{/each}
		</div>

		<Slider.Root
			type="multiple"
			bind:value
			{min}
			{max}
			step={1}
			onValueCommit={commit}
			class="relative flex h-5 w-full touch-none select-none items-center"
		>
			<span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
				<Slider.Range class="absolute h-full bg-primary" />
			</span>
			<Slider.Thumb
				index={0}
				aria-label="Lägsta pris"
				class="block h-4 w-4 cursor-pointer rounded-full border border-primary bg-background shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
			/>
			<Slider.Thumb
				index={1}
				aria-label="Högsta pris"
				class="block h-4 w-4 cursor-pointer rounded-full border border-primary bg-background shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
			/>
		</Slider.Root>
	{:else}
		<p class="text-sm text-muted-foreground">{min} kr</p>
	{/if}

	<!-- Carried into the GET form; empty at full range = no filter. -->
	<input type="hidden" name={PARAM.priceMin} value={minParam} />
	<input type="hidden" name={PARAM.priceMax} value={maxParam} />
</div>
