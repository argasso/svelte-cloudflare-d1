<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	import Pill from '$lib/components/Pill.svelte';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();
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

	<Card.Root>
		<Card.Header>
			<Card.Title>All Products ({data.pagination.total})</Card.Title>
			<Card.Description>
				Page {data.pagination.page} of {data.pagination.totalPages}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Title</Table.Head>
						<Table.Head>SKU / ISBN</Table.Head>
						<Table.Head>Categories</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Updated</Table.Head>
						<Table.Head class="w-[100px]">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.products as product}
						<Table.Row>
							<Table.Cell class="font-medium">
								<a href="/admin/products/{product.id}" class="hover:underline">
									{product.title}
								</a>
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{#if product.isbn}
									<div class="font-mono text-xs">ISBN: {product.isbn}</div>
								{/if}
								{#if product.sku}
									<div class="font-mono text-xs">SKU: {product.sku}</div>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap gap-1">
									{#each product.categories.slice(0, 3) as category}
										<Pill>{category.title}</Pill>
									{/each}
									{#if product.categories.length > 3}
										<Pill>+{product.categories.length - 3}</Pill>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								{#if product.status === 'Active'}
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800"
									>
										Active
									</span>
								{:else if product.status === 'Draft'}
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-800"
									>
										Draft
									</span>
								{:else}
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800"
									>
										Archived
									</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{new Date(product.updatedAt).toLocaleDateString('sv-SE')}
							</Table.Cell>
							<Table.Cell>
								<a
									href="/admin/products/{product.id}"
									class="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
								>
									Edit
								</a>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="flex justify-between">
			<Button
				variant="outline"
				disabled={data.pagination.page === 1}
				href="/admin/products?page={data.pagination.page - 1}"
			>
				Previous
			</Button>
			<div class="text-sm text-muted-foreground">
				Page {data.pagination.page} of {data.pagination.totalPages}
			</div>
			<Button
				variant="outline"
				disabled={data.pagination.page === data.pagination.totalPages}
				href="/admin/products?page={data.pagination.page + 1}"
			>
				Next
			</Button>
		</Card.Footer>
	</Card.Root>
</div>
