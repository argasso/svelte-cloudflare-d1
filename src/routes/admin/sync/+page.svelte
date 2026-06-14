<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { invalidateAll } from '$app/navigation';
	import { pushSync } from './sync.remote';

	let { data } = $props();

	const typeLabel: Record<string, string> = {
		product: 'Product',
		variant: 'Variant',
		metaobject: 'Page / Author'
	};

	const editHref = (type: string, id: number | string) =>
		type === 'product'
			? `/admin/products/${id}`
			: type === 'metaobject'
				? `/admin/pages/${id}`
				: null;

	const pushAll = pushSync.for('all');

	function badgeClass(action: string) {
		if (action === 'pushed') return 'text-green-600';
		if (action === 'conflict') return 'text-amber-600';
		if (action === 'failed') return 'text-destructive';
		return 'text-muted-foreground';
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Sync</h1>
			<p class="text-muted-foreground">Push local changes to Shopify</p>
		</div>
		<form
			{...pushAll.enhance(async ({ submit }) => {
				await submit();
				await invalidateAll();
			})}
		>
			<input type="hidden" name="type" value="" />
			<input type="hidden" name="id" value="" />
			<Button type="submit" disabled={!!pushAll.pending || data.dirty.length === 0}>
				<RefreshCw class="mr-2 h-4 w-4" />
				{pushAll.pending ? 'Pushing…' : `Push all (${data.dirty.length})`}
			</Button>
		</form>
	</div>

	<div
		class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
	>
		<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
		<span>
			Pushing writes to the <strong>production</strong> Shopify store. Changes made in Shopify
			since the last sync are detected and shown as conflicts instead of being overwritten.
		</span>
	</div>

	{#if pushAll.result}
		{@const s = pushAll.result.summary}
		<Card.Root>
			<Card.Header>
				<Card.Title>Last push</Card.Title>
				<Card.Description>
					{s.pushed} pushed · {s.conflict} conflict · {s.failed} failed · {s.skipped} skipped
				</Card.Description>
			</Card.Header>
			{#if s.conflict > 0 || s.failed > 0}
				<Card.Content>
					<ul class="space-y-1 text-sm">
						{#each pushAll.result.entries.filter((e) => e.action !== 'pushed') as e (e.type + e.title)}
							<li>
								<span class={badgeClass(e.action)}>{e.action}</span>
								— {typeLabel[e.type]}: {e.title}
								{#if e.error}<span class="text-muted-foreground">({e.error})</span>{/if}
							</li>
						{/each}
					</ul>
				</Card.Content>
			{/if}
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Pending changes ({data.dirty.length})</Card.Title>
			<Card.Description>Rows edited locally since the last sync</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.dirty.length === 0}
				<p class="text-sm text-muted-foreground">Nothing to sync — everything is up to date.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Type</Table.Head>
							<Table.Head>Title</Table.Head>
							<Table.Head>Edited</Table.Head>
							<Table.Head class="w-[160px]">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.dirty as row (row.type + ':' + row.id)}
							{@const f = pushSync.for(row.type + ':' + String(row.id))}
							{@const href = editHref(row.type, row.id)}
							<Table.Row>
								<Table.Cell class="text-sm text-muted-foreground">{typeLabel[row.type]}</Table.Cell>
								<Table.Cell class="font-medium">
									{#if href}
										<a {href} class="hover:underline">{row.title ?? row.id}</a>
									{:else}
										{row.title ?? row.id}
									{/if}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{new Date(row.updatedAt).toLocaleString('sv-SE')}
								</Table.Cell>
								<Table.Cell>
									<form
										{...f.enhance(async ({ submit }) => {
											await submit();
											await invalidateAll();
										})}
									>
										<input type="hidden" name="type" value={row.type} />
										<input type="hidden" name="id" value={row.id} />
										<Button type="submit" variant="outline" size="sm" disabled={!!f.pending}>
											{f.pending ? 'Pushing…' : 'Push'}
										</Button>
									</form>
									{#if f.result && f.result.entries[0] && f.result.entries[0].action !== 'pushed'}
										<p class="mt-1 text-xs {badgeClass(f.result.entries[0].action)}">
											{f.result.entries[0].action}{f.result.entries[0].error
												? `: ${f.result.entries[0].error}`
												: ''}
										</p>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent activity</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.recent.length === 0}
				<p class="text-sm text-muted-foreground">No sync activity yet.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>When</Table.Head>
							<Table.Head>Type</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Detail</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.recent as entry (entry.id)}
							<Table.Row>
								<Table.Cell class="text-sm text-muted-foreground">
									{new Date(entry.timestamp).toLocaleString('sv-SE')}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{typeLabel[entry.entityType]}</Table.Cell>
								<Table.Cell
									class="text-sm {entry.status === 'success'
										? 'text-green-600'
										: entry.status === 'failed'
											? 'text-destructive'
											: 'text-amber-600'}"
								>
									{entry.status}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{entry.errorMessage ?? ''}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
