<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Package from '@lucide/svelte/icons/package';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Database from '@lucide/svelte/icons/database';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-3xl font-bold">Dashboard</h1>
		<p class="text-muted-foreground">Welcome to Argasso Admin</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Products</Card.Title>
				<Package class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.products}</div>
				<p class="text-xs text-muted-foreground">Books in catalog</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Variants</Card.Title>
				<Database class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.variants}</div>
				<p class="text-xs text-muted-foreground">Product variants</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Categories</Card.Title>
				<FolderTree class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.categories}</div>
				<p class="text-xs text-muted-foreground">Page hierarchy</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Categorizations</Card.Title>
				<Link2 class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.links}</div>
				<p class="text-xs text-muted-foreground">Product-category links</p>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Products</Card.Title>
			<Card.Description>Latest updated products</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="space-y-2">
				{#each data.recentProducts as product}
					<div class="flex items-center justify-between">
						<div>
							<div class="font-medium">{product.title}</div>
							<div class="text-sm text-muted-foreground">
								Updated {new Date(product.updatedAt).toLocaleDateString('sv-SE')}
							</div>
						</div>
						<Button variant="outline" size="sm" href="/admin/products/{product.id}">
							Edit
						</Button>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Quick Actions</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2">
				<Button class="w-full" href="/admin/products">Manage Products</Button>
				<Button variant="outline" class="w-full" href="/admin/pages">
					Manage Categories
				</Button>
			</Card.Content>
		</Card.Root>

		{#if data.syncEnabled}
			<Card.Root>
				<Card.Header>
					<Card.Title>Data Sync</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<p class="text-sm text-muted-foreground">
						Your D1 database contains all Shopify data. Sync status coming soon.
					</p>
					<Button variant="outline" class="w-full" href="/admin/sync">
						View Sync Dashboard
					</Button>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
