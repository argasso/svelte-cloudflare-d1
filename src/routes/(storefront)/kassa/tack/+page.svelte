<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();
	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;
</script>

<Seo title="Tack för din beställning" noindex />

<div class="container mx-auto max-w-2xl px-4 py-12 text-center">
	<h1 class="text-3xl font-bold">Tack för din beställning!</h1>

	{#if data.order}
		<p class="mt-3 text-muted-foreground">
			Order #{data.order.id} är mottagen{data.order.email ? ` — en bekräftelse skickas till ${data.order.email}` : ''}.
			{#if data.order.receiptNumber != null}
				<br />Kvittonummer: {String(data.order.receiptNumber).padStart(6, '0')}
			{/if}
		</p>

		<div class="mx-auto mt-8 max-w-md rounded-lg border p-4 text-left">
			{#each data.order.items as item (item.id)}
				<div class="flex justify-between border-b py-2 text-sm last:border-0">
					<span>{item.quantity} × {item.title}</span>
					<span>{kr(item.lineTotal)}</span>
				</div>
			{/each}
			<div class="mt-2 flex justify-between border-t pt-2 font-bold">
				<span>Totalt</span><span>{kr(data.order.total)}</span>
			</div>
		</div>
	{:else}
		<p class="mt-3 text-muted-foreground">Din betalning bekräftas. Tack!</p>
	{/if}

	<Button href="/bocker" class="mt-8">Fortsätt handla</Button>
</div>
