<script lang="ts">
	let { href, name, children }: { href?: string; name?: string; children?: any } = $props();
</script>

{#if href && name}
	<span
		class="mb-1 mr-1 inline-block rounded-full bg-accent px-2 py-1 text-center text-xxs uppercase text-foreground last:mr-0"
	>
		<a {href}>{name}</a>
	</span>
{:else}
	<span
		class="mb-1 mr-1 inline-block rounded-full bg-accent px-2 py-1 text-center text-xxs uppercase text-foreground last:mr-0"
	>
		{@render children?.()}
	</span>
{/if}
