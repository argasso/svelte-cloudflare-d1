<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';

	let { heading, bodyHtml }: { heading: string; bodyHtml: string } = $props();
</script>

<Seo title={heading} />

<div class="container mx-auto px-4 py-8">
	<!-- Breadcrumb -->
	<nav class="mb-4 text-sm text-muted-foreground">
		<a href="/" class="hover:underline">Hem</a>
		<span class="mx-1">/</span>
		<span class="text-foreground">{heading}</span>
	</nav>

	<h1 class="text-4xl font-bold">{heading}</h1>

	<div class="prose mt-6 max-w-none">
		{@html bodyHtml}
	</div>
</div>
