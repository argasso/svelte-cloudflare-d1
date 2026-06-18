<script lang="ts">
	// Emits a JSON-LD structured-data tag. `<` in the JSON is escaped so the
	// closing tag can't be broken out of by any string value.
	let { data }: { data: unknown } = $props();
	const open = '<' + 'script type="application/ld+json">';
	const close = '<' + '/script>';
	const html = $derived(open + JSON.stringify(data).replace(/</g, '\\u003c') + close);
</script>

<svelte:head>
	{@html html}
</svelte:head>
