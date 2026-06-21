<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Printer from '@lucide/svelte/icons/printer';

	let { data } = $props();
	const { order, seller, vat } = $derived(data);

	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`;
	const date = $derived(new Date(order.createdAt).toLocaleDateString('sv-SE'));
	const addr = $derived(order.shippingAddress);
</script>

<div class="mx-auto max-w-2xl p-6 print:p-0">
	<div class="mb-6 flex items-center justify-between print:hidden">
		<Button variant="ghost" size="sm" href="/admin/orders/{order.id}">← Tillbaka</Button>
		<Button size="sm" onclick={() => window.print()}>
			<Printer class="mr-2 h-4 w-4" /> Skriv ut
		</Button>
	</div>

	<article class="rounded-lg border p-8 print:border-0 print:p-0">
		<header class="flex items-start justify-between">
			<div>
				<h1 class="text-2xl font-bold">{seller.name}</h1>
				{#each seller.addressLines as line (line)}<div class="text-sm">{line}</div>{/each}
				<div class="text-sm">{seller.phone}</div>
				{#if seller.orgNumber}<div class="mt-1 text-xs text-muted-foreground">Org.nr: {seller.orgNumber}</div>{/if}
				{#if seller.vatNumber}<div class="text-xs text-muted-foreground">Momsreg.nr: {seller.vatNumber}</div>{/if}
			</div>
			<div class="text-right">
				<h2 class="text-lg font-semibold">Kvitto</h2>
				<div class="text-sm">Nr: {data.receiptNumber}</div>
				<div class="text-sm">Datum: {date}</div>
				<div class="text-sm text-muted-foreground">Order #{order.id}</div>
			</div>
		</header>

		{#if order.customerName || addr || order.email}
			<section class="mt-6 text-sm">
				<div class="font-medium">Kund</div>
				{#if order.customerName}<div>{order.customerName}</div>{/if}
				{#if addr}
					<div>{addr.line1 ?? ''}</div>
					{#if addr.line2}<div>{addr.line2}</div>{/if}
					<div>{[addr.postalCode, addr.city].filter(Boolean).join(' ')}</div>
				{/if}
				{#if order.email}<div class="text-muted-foreground">{order.email}</div>{/if}
			</section>
		{/if}

		<table class="mt-6 w-full border-collapse text-sm">
			<thead>
				<tr class="border-b text-left">
					<th class="py-2">Artikel</th>
					<th class="py-2 text-right">Antal</th>
					<th class="py-2 text-right">Pris</th>
					<th class="py-2 text-right">Summa</th>
				</tr>
			</thead>
			<tbody>
				{#each order.items as item (item.id)}
					<tr class="border-b">
						<td class="py-2">{item.title}</td>
						<td class="py-2 text-right">{item.quantity}</td>
						<td class="py-2 text-right">{kr(item.unitPrice)}</td>
						<td class="py-2 text-right">{kr(item.lineTotal)}</td>
					</tr>
				{/each}
				{#if order.shipping > 0}
					<tr class="border-b">
						<td class="py-2" colspan="3">Frakt</td>
						<td class="py-2 text-right">{kr(order.shipping)}</td>
					</tr>
				{/if}
			</tbody>
		</table>

		<section class="mt-4 ml-auto w-64 space-y-1 text-sm">
			<div class="flex justify-between">
				<span class="text-muted-foreground">Netto</span><span>{kr(vat.net)}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground">Moms ({Math.round(vat.rate * 100)} %)</span><span>{kr(vat.vat)}</span>
			</div>
			<div class="flex justify-between border-t pt-1 text-base font-bold">
				<span>Att betala</span><span>{kr(vat.gross)}</span>
			</div>
			{#if order.refundedAmount > 0}
				<div class="flex justify-between text-destructive">
					<span>Återbetalat</span><span>−{kr(order.refundedAmount)}</span>
				</div>
			{/if}
		</section>

		<footer class="mt-8 text-center text-xs text-muted-foreground">
			Tack för ditt köp! · Betald via Stripe
		</footer>
	</article>
</div>
