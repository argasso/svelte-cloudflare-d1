<script lang="ts">
	import PolicyPage from '$lib/components/PolicyPage.svelte';

	let { data } = $props();
</script>

<PolicyPage heading={data.heading} bodyHtml={data.bodyHtml} />
