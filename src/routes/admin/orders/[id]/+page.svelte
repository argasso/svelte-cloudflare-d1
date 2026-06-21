<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { invalidateAll } from '$app/navigation';
	import { setOrderStatus } from '../orders.remote';

	let { data } = $props();
	let { order } = $derived(data);

	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;
	const when = (s: string) => new Date(s).toLocaleString('sv-SE');

	const fulfil = $derived(setOrderStatus.for(`fulfil-${order.id}`));
	const reopen = $derived(setOrderStatus.for(`reopen-${order.id}`));
	const cancel = $derived(setOrderStatus.for(`cancel-${order.id}`));

	const addr = $derived(order.shippingAddress);
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/orders">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">Order #{order.id}</h1>
			<p class="text-muted-foreground">{when(order.createdAt)} · {order.status}</p>
		</div>

		{#if order.status === 'paid'}
			<form {...fulfil.enhance(async ({ submit }) => { if (await submit()) await invalidateAll(); })}>
				<input type="hidden" name="id" value={order.id} />
				<input type="hidden" name="status" value="fulfilled" />
				<Button type="submit" disabled={!!fulfil.pending}>Markera skickad</Button>
			</form>
			<form {...cancel.enhance(async ({ submit }) => { if (await submit()) await invalidateAll(); })}>
				<input type="hidden" name="id" value={order.id} />
				<input type="hidden" name="status" value="cancelled" />
				<Button type="submit" variant="outline" disabled={!!cancel.pending}>Avbryt</Button>
			</form>
		{:else if order.status === 'fulfilled'}
			<form {...reopen.enhance(async ({ submit }) => { if (await submit()) await invalidateAll(); })}>
				<input type="hidden" name="id" value={order.id} />
				<input type="hidden" name="status" value="paid" />
				<Button type="submit" variant="outline" disabled={!!reopen.pending}>Ångra skickad</Button>
			</form>
		{/if}
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<Card.Root class="md:col-span-2">
			<Card.Header><Card.Title>Artiklar</Card.Title></Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Body>
						{#each order.items as item (item.id)}
							<Table.Row>
								<Table.Cell>{item.quantity} × {item.title}</Table.Cell>
								<Table.Cell class="text-right">{kr(item.lineTotal)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
				<div class="mt-4 space-y-1 text-sm">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Delsumma</span><span>{kr(order.subtotal)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Frakt</span>
						<span>{order.shipping === 0 ? 'Fri' : kr(order.shipping)}</span>
					</div>
					<div class="flex justify-between border-t pt-1 font-bold">
						<span>Totalt</span><span>{kr(order.total)}</span>
					</div>
					<p class="text-xs text-muted-foreground">Varav moms (6 %): {kr(order.vatAmount)}</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>Kund</Card.Title></Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<div>
					<div class="text-muted-foreground">E-post</div>
					<div>{order.email ?? '—'}</div>
				</div>
				<div>
					<div class="text-muted-foreground">Leveransadress</div>
					{#if addr}
						<div>{order.customerName ?? ''}</div>
						<div>{addr.line1 ?? ''}</div>
						{#if addr.line2}<div>{addr.line2}</div>{/if}
						<div>{[addr.postalCode, addr.city].filter(Boolean).join(' ')}</div>
						<div>{addr.country ?? ''}</div>
					{:else}
						<div>—</div>
					{/if}
				</div>
				<div>
					<div class="text-muted-foreground">Betalning</div>
					<div class="font-mono text-xs break-all">{order.stripePaymentIntentId ?? '—'}</div>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
</div>
