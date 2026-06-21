<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props();

	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;
	const when = (s: string) => new Date(s).toLocaleString('sv-SE');

	const statusClass: Record<string, string> = {
		paid: 'text-green-600',
		fulfilled: 'text-blue-600',
		cancelled: 'text-destructive',
		pending: 'text-amber-600'
	};
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-3xl font-bold">Orders</h1>
		<p class="text-muted-foreground">Betalda beställningar</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			{#if data.orders.length === 0}
				<p class="text-sm text-muted-foreground">Inga beställningar än.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Order</Table.Head>
							<Table.Head>Datum</Table.Head>
							<Table.Head>Kund</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="text-right">Summa</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.orders as order (order.id)}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href="/admin/orders/{order.id}" class="hover:underline">#{order.id}</a>
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{when(order.createdAt)}</Table.Cell>
								<Table.Cell class="text-sm">{order.email ?? '—'}</Table.Cell>
								<Table.Cell class="text-sm {statusClass[order.status] ?? ''}">{order.status}</Table.Cell>
								<Table.Cell class="text-right font-medium">{kr(order.total)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
