<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import User from '@lucide/svelte/icons/user';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();
	$inspect(data)
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
		<Card.Header>
			<Card.Title>All Authors</Card.Title>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>
							<User class="mr-2 h-4 w-4 inline" />
							Name
						</Table.Head>
						<Table.Head>Handle</Table.Head>
						<Table.Head>Books</Table.Head>
						<Table.Head class="w-[100px]">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.authors as author}
						<Table.Row>
							<Table.Cell class="font-medium">
								{author.title}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground font-mono">
								{author.handle}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{(author as any).bookCount || 0}
							</Table.Cell>
							<Table.Cell>
								<a
									href="/admin/authors/{author.id}"
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
	</Card.Root>
</div>
