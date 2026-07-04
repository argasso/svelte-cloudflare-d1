<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import Package from '@lucide/svelte/icons/package';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import User from '@lucide/svelte/icons/user';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	let { data } = $props();

	const nav = (e: MouseEvent, href: string) => (e.metaKey || e.ctrlKey) || goto(href);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-3xl font-bold">Dashboard</h1>
		<p class="text-muted-foreground">Welcome to Argasso Admin</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<!-- Products (incl. variants) -->
		<Card.Root
			class="cursor-pointer transition hover:border-primary hover:shadow-md"
			onclick={(e) => nav(e, '/admin/products')}
		>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">
					<a href="/admin/products" class="hover:underline">Products</a>
				</Card.Title>
				<Package class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.products}</div>
				<p class="text-xs text-muted-foreground">{data.stats.variants} variants</p>
				{#if data.sync && data.sync.products > 0}
					<a
						href="/admin/sync"
						onclick={(e) => e.stopPropagation()}
						class="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
					>
						<RefreshCw class="h-3 w-3" />
						{data.sync.products} to sync
					</a>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Authors -->
		<Card.Root
			class="cursor-pointer transition hover:border-primary hover:shadow-md"
			onclick={(e) => nav(e, '/admin/authors')}
		>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">
					<a href="/admin/authors" class="hover:underline">Authors</a>
				</Card.Title>
				<User class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.authors}</div>
				<p class="text-xs text-muted-foreground">Book authors</p>
				{#if data.sync && data.sync.authors > 0}
					<a
						href="/admin/sync"
						onclick={(e) => e.stopPropagation()}
						class="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
					>
						<RefreshCw class="h-3 w-3" />
						{data.sync.authors} to sync
					</a>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Pages & Categories -->
		<Card.Root
			class="cursor-pointer transition hover:border-primary hover:shadow-md"
			onclick={(e) => nav(e, '/admin/pages')}
		>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">
					<a href="/admin/pages" class="hover:underline">Pages &amp; Categories</a>
				</Card.Title>
				<FolderTree class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.pages}</div>
				<p class="text-xs text-muted-foreground">Pages &amp; book categories</p>
				{#if data.sync && data.sync.pages > 0}
					<a
						href="/admin/sync"
						onclick={(e) => e.stopPropagation()}
						class="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
					>
						<RefreshCw class="h-3 w-3" />
						{data.sync.pages} to sync
					</a>
				{/if}
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
				{#each data.recentProducts as product (product.id)}
					<div class="flex items-center justify-between">
						<div>
							<div class="font-medium">{product.title}</div>
							<div class="text-sm text-muted-foreground">
								Updated {new Date(product.updatedAt).toLocaleDateString('sv-SE')}
							</div>
						</div>
						<Button variant="outline" size="sm" href="/admin/products/{product.id}">Edit</Button>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Quick Actions</Card.Title>
		</Card.Header>
		<Card.Content class="grid gap-2 sm:grid-cols-3">
			<Button href="/admin/products">Manage Products</Button>
			<Button variant="outline" href="/admin/authors">Manage Authors</Button>
			<Button variant="outline" href="/admin/pages">Manage Categories</Button>
		</Card.Content>
	</Card.Root>
</div>
