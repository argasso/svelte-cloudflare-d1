<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import FilteredBookListing from '$lib/components/FilteredBookListing.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title="Alla böcker"
	description="Bläddra bland Argassos hela sortiment av lättlästa böcker för barn och unga."
/>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<h1 class="text-4xl font-bold mb-4">Alla böcker</h1>
		<p class="text-muted-foreground">Bläddra bland vårt sortiment av {data.total} böcker</p>
	</div>

	<!-- Category filters -->
	{#if data.categories.length > 0}
		<div class="mb-6 flex flex-wrap gap-2">
			<Button variant="outline" href="/bocker">Alla</Button>
			{#each data.categories as category (category.handle)}
				<Button variant="outline" href="/{category.handle}">{category.label}</Button>
			{/each}
		</div>
	{/if}

	<FilteredBookListing
		facets={data.facets}
		sort={data.sort}
		products={data.products}
		total={data.total}
		page={data.page}
		totalPages={data.totalPages}
		imageTransforms={data.imageTransforms}
	/>
</div>
