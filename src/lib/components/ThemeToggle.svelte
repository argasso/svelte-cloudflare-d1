<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	// Optional class override so the storefront's gradient header can tint it white.
	let { class: className = '' }: { class?: string } = $props();
</script>

<Button
	variant="ghost"
	size="icon"
	class={className}
	onclick={toggleMode}
	aria-label={mode.current === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema'}
	title={mode.current === 'dark' ? 'Ljust tema' : 'Mörkt tema'}
>
	{#if mode.current === 'dark'}
		<Sun />
	{:else}
		<Moon />
	{/if}
</Button>
