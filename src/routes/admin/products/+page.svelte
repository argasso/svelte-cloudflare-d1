<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import FilteredBookListing from '$lib/components/FilteredBookListing.svelte';
	import { goto } from '$app/navigation';
	import type { SortKey } from '$lib/book-filters';

	let { data } = $props();

	const statusClass: Record<string, string> = {
		Active: 'bg-green-100 text-green-800',
		Draft: 'bg-gray-100 text-gray-800',
		Archived: 'bg-red-100 text-red-800'
	};

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
			<div class="overflow-x-auto rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Title</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Categories</Table.Head>
							<Table.Head>Updated</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.rows as product (product.id)}
							<Table.Row
								class="cursor-pointer"
								onclick={(e) => (e.metaKey || e.ctrlKey) || goto(`/admin/products/${product.id}`)}
							>
								<Table.Cell class="max-w-[28rem] truncate font-medium">
									<a href="/admin/products/{product.id}" class="hover:underline">{product.title}</a>
								</Table.Cell>
								<Table.Cell>
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[
											product.status
										]}"
									>
										{product.status}
									</span>
								</Table.Cell>
								<Table.Cell class="whitespace-nowrap">
									<div class="flex items-center gap-1">
										{#each product.categories.slice(0, 3) as category (category)}
											<span
												class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
											>
												{category}
											</span>
										{/each}
										{#if product.categories.length > 3}
											<span class="text-xs text-muted-foreground">+{product.categories.length - 3}</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="whitespace-nowrap text-sm text-muted-foreground">
									{new Date(product.updatedAt).toLocaleDateString('sv-SE')}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/snippet}
	</FilteredBookListing>
</div>
