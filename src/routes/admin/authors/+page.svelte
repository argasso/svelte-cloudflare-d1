<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import User from '@lucide/svelte/icons/user';
	import Plus from '@lucide/svelte/icons/plus';
	import AdminListSearch from '$lib/components/AdminListSearch.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const SORTS = [
		{ value: 'titel-asc', label: 'Namn A–Ö' },
		{ value: 'titel-desc', label: 'Namn Ö–A' },
		{ value: 'flest-bocker', label: 'Flest böcker' }
	];

	const statusClass: Record<string, string> = {
		Active: 'bg-green-100 text-green-800',
		Draft: 'bg-gray-100 text-gray-800',
		Archived: 'bg-red-100 text-red-800'
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Authors</h1>
			<p class="text-muted-foreground">Manage book authors ({data.total})</p>
		</div>
		<Button href="/admin/authors/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Author
		</Button>
	</div>

	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between gap-4">
			<Card.Title>All Authors ({data.shown})</Card.Title>
			<AdminListSearch sortOptions={SORTS} placeholder="Sök författare…" />
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>
							<User class="mr-2 h-4 w-4 inline" />
							Name
						</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Handle</Table.Head>
						<Table.Head>Books</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if data.authors.length === 0}
						<Table.Row>
							<Table.Cell colspan={4} class="py-8 text-center text-muted-foreground">
								Inga författare matchar sökningen.
							</Table.Cell>
						</Table.Row>
					{/if}
					{#each data.authors as author (author.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={(e) => (e.metaKey || e.ctrlKey) || goto(`/admin/authors/${author.id}`)}
						>
							<Table.Cell class="font-medium">
								<a href="/admin/authors/{author.id}" class="hover:underline">{author.title}</a>
							</Table.Cell>
							<Table.Cell>
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[
										author.status
									]}"
								>
									{author.status}
								</span>
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground font-mono">
								{author.handle}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{(author as any).bookCount || 0}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
