<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { afterNavigate } from '$app/navigation';

	interface Props extends HTMLAttributes<HTMLFormElement> {
		after: string | null;
		before?: string | null;
		size?: string | null;
		sort?: string | null;
		noScroll?: boolean;
	}

	let { after, before, size, sort, noScroll }: Props = $props();
	let isProductsLoading = $state(false);

    $inspect(after, before, size, sort, noScroll)

	afterNavigate(() => {
		isProductsLoading = false;
	});

	function handleSubmit() {
		isProductsLoading = true;
	}
</script>

<form
	action="#book-section"
	data-sveltekit-keepfocus
	data-sveltekit-noscroll={noScroll}
	on:submit={handleSubmit}
>
	{#if after}
		<input type="hidden" name="after" value={after} />
	{/if}
	{#if before}
		<input type="hidden" name="before" value={before} />
	{/if}
	{#if size}
		<input type="hidden" name="size" value={size} />
	{/if}
	{#if sort}
		<input type="hidden" name="sort" value={sort} />
	{/if}
	<slot />
</form>
