<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import Pill from '$lib/components/Pill.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import FilteredBookListing from '$lib/components/FilteredBookListing.svelte';
	import type { SortKey } from '$lib/book-filters';

	let { data } = $props();

	const ADMIN_SORTS: { value: SortKey; label: string }[] = [
		{ value: 'titel-asc', label: 'Titel A–Ö' },
		{ value: 'titel-desc', label: 'Titel Ö–A' },
		{ value: 'uppdaterad-desc', label: 'Senast uppdaterad' }
	];
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Products</h1>
			<p class="text-muted-foreground">Manage your book catalog</p>
		</div>
		<Button href="/admin/products/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Product
		</Button>
	</div>

	<FilteredBookListing
		facets={data.facets}
		sort={data.sort}
		total={data.total}
		page={data.page}
		totalPages={data.totalPages}
		empty={data.rows.length === 0}
		showSearch
		noun="böcker"
		sortOptions={ADMIN_SORTS}
	>
		{#snippet results()}
			<div class="rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Title</Table.Head>
							<Table.Head>Categories</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Updated</Table.Head>
							<Table.Head class="w-[80px]"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.rows as product (product.id)}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href="/admin/products/{product.id}" class="hover:underline">{product.title}</a>
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-wrap gap-1">
										{#each product.categories.slice(0, 3) as category (category)}
											<Pill>{category}</Pill>
										{/each}
										{#if product.categories.length > 3}
											<Pill>+{product.categories.length - 3}</Pill>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell>
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {product.status ===
										'Active'
											? 'bg-green-100 text-green-800'
											: product.status === 'Draft'
												? 'bg-gray-100 text-gray-800'
												: 'bg-red-100 text-red-800'}"
									>
										{product.status}
									</span>
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{new Date(product.updatedAt).toLocaleDateString('sv-SE')}
								</Table.Cell>
								<Table.Cell>
									<a
										href="/admin/products/{product.id}"
										class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
									>
										Edit
									</a>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/snippet}
	</FilteredBookListing>
</div>
