<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import Plus from '@lucide/svelte/icons/plus';
	import AdminListSearch from '$lib/components/AdminListSearch.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const statusClass: Record<string, string> = {
		Active: 'bg-green-100 text-green-800',
		Draft: 'bg-gray-100 text-gray-800',
		Archived: 'bg-red-100 text-red-800'
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Pages & Categories</h1>
			<p class="text-muted-foreground">Manage site pages and book categories ({data.total})</p>
		</div>
		<Button href="/admin/pages/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Page
		</Button>
	</div>

	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between gap-4">
			<Card.Title>All Pages ({data.shown})</Card.Title>
			<AdminListSearch placeholder="Sök sida/kategori…" />
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>
							<FolderTree class="mr-2 h-4 w-4 inline" />
							Title
						</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Handle</Table.Head>
						<Table.Head>Sub-pages</Table.Head>
						<Table.Head>Products</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if data.pages.length === 0}
						<Table.Row>
							<Table.Cell colspan={5} class="py-8 text-center text-muted-foreground">
								Inga sidor matchar sökningen.
							</Table.Cell>
						</Table.Row>
					{/if}
					{#each data.pages as page (page.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={(e) => (e.metaKey || e.ctrlKey) || goto(`/admin/pages/${page.id}`)}
						>
							<Table.Cell class="font-medium">
								<span style="padding-left: {page.depth * 1.5}rem">
									{#if page.depth > 0}<span class="text-muted-foreground mr-1">└</span>{/if}
									<a href="/admin/pages/{page.id}" class="hover:underline">{page.title}</a>
								</span>
							</Table.Cell>
							<Table.Cell>
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[
										page.status
									]}"
								>
									{page.status}
								</span>
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground font-mono">
								{page.handle}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{page.childCount || ''}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{page.productCount || ''}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
