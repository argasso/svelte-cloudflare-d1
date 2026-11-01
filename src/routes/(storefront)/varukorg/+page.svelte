<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { mediaImage } from '$lib/utils/image';
	import Seo from '$lib/components/Seo.svelte';
	import { setQty, removeFromCart, startCheckout } from '../cart.remote';

	let { data } = $props();

	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;
</script>

<Seo title="Varukorg" noindex />

<div class="container mx-auto px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold">Varukorg</h1>

	{#if data.cart.items.length === 0}
		<p class="text-muted-foreground">Din varukorg är tom.</p>
		<Button href="/bocker" class="mt-4">Till böckerna</Button>
	{:else}
		<div class="grid gap-8 lg:grid-cols-3">
			<div class="lg:col-span-2 space-y-4">
				{#each data.cart.items as item (item.variantId)}
					{@const sq = setQty.for(item.variantId)}
					{@const rm = removeFromCart.for(item.variantId)}
					<div class="flex gap-4 border-b pb-4">
						<div class="h-24 w-16 shrink-0 overflow-hidden rounded bg-muted">
							{#if item.cover}
								<img
									src={mediaImage(item.cover, 'thumb', data.imageTransforms)}
									alt={item.title}
									class="h-full w-full object-cover"
								/>
							{/if}
						</div>
						<div class="flex flex-1 flex-col">
							<a href="/bok/{item.handle ?? item.productId}" class="font-semibold hover:underline">{item.title}</a>
							{#if item.variantTitle && item.variantTitle !== 'Default Title'}
								<span class="text-sm text-muted-foreground">{item.variantTitle}</span>
							{/if}
							<span class="text-sm">{kr(item.unitPrice)}</span>
							<div class="mt-auto flex flex-wrap items-center gap-3">
								<!-- Qty: auto-submits on change with JS; the <noscript> button
								     keeps it working without JS too. -->
								<form {...sq} class="flex items-center gap-2">
									<input type="hidden" name="variantId" value={item.variantId} />
									<label class="text-sm text-muted-foreground" for="qty-{item.variantId}">Antal</label>
									<input
										id="qty-{item.variantId}"
										name="qty"
										type="number"
										min="0"
										max="99"
										value={item.qty}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
										class="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm"
									/>
									<noscript>
										<button
											type="submit"
											class="h-9 cursor-pointer rounded-md border px-3 text-sm hover:bg-accent"
										>
											Uppdatera
										</button>
									</noscript>
								</form>
								<form {...rm}>
									<input type="hidden" name="variantId" value={item.variantId} />
									<button
										type="submit"
										class="inline-flex h-9 cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-destructive"
									>
										<Trash2 class="h-4 w-4" /> Ta bort
									</button>
								</form>
							</div>
						</div>
						<div class="font-semibold">{kr(item.lineTotal)}</div>
					</div>
				{/each}
			</div>

			<div class="space-y-3 rounded-lg border p-4">
				<h2 class="text-lg font-semibold">Sammanfattning</h2>
				<div class="flex justify-between text-sm">
					<span class="text-muted-foreground">Delsumma</span><span>{kr(data.cart.subtotal)}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-muted-foreground">Frakt</span>
					<span>{data.cart.shipping === 0 ? 'Fri' : kr(data.cart.shipping)}</span>
				</div>
				<div class="flex justify-between border-t pt-3 font-bold">
					<span>Totalt</span><span>{kr(data.cart.total)}</span>
				</div>
				<p class="text-xs text-muted-foreground">Varav moms (6 %): {kr(data.cart.vatAmount)}</p>
				{#if data.commerceEnabled}
					<form {...startCheckout}>
						<Button type="submit" class="w-full" disabled={!!startCheckout.pending}>
							{startCheckout.pending ? 'Tar dig till kassan…' : 'Till kassan'}
						</Button>
					</form>
				{/if}
			</div>
		</div>
	{/if}
</div>
