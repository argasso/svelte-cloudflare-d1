<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Seo from '$lib/components/Seo.svelte';
	import { invalidateAll } from '$app/navigation';
	import { requestWithdrawal } from '../../order.remote';

	let { data } = $props();
	const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;

	const statusLabel: Record<string, string> = {
		paid: 'Betald',
		fulfilled: 'Skickad',
		cancelled: 'Avbruten',
		refunded: 'Återbetald'
	};

	// Two-step withdrawal: first reveal the confirm form, then submit it.
	let step = $state<'idle' | 'confirm'>('idle');
	const withdraw = $derived(requestWithdrawal.for(`wd-${data.order.id}`));
</script>

<Seo title={`Order #${data.order.id}`} noindex />

<div class="container mx-auto max-w-2xl px-4 py-8">
	<h1 class="text-3xl font-bold">Order #{data.order.id}</h1>
	<p class="mt-1 text-muted-foreground">
		Status: {statusLabel[data.order.status] ?? data.order.status}
		{#if data.order.receiptNumber != null}· Kvitto {String(data.order.receiptNumber).padStart(6, '0')}{/if}
	</p>

	<div class="mt-6 rounded-lg border p-4">
		{#each data.order.items as item (item.id)}
			<div class="flex justify-between border-b py-2 text-sm last:border-0">
				<span>{item.quantity} × {item.title}</span><span>{kr(item.lineTotal)}</span>
			</div>
		{/each}
		<div class="mt-2 flex justify-between border-t pt-2 font-bold">
			<span>Totalt</span><span>{kr(data.order.total)}</span>
		</div>
	</div>

	<!-- EU right of withdrawal (Dir. 2023/2673) -->
	<div class="mt-8 rounded-lg border p-4">
		<h2 class="font-semibold">Ångerrätt</h2>
		{#if data.order.withdrawalRequestedAt}
			<p class="mt-2 text-sm text-green-700">
				Vi har tagit emot din anmälan om ångerrätt. En bekräftelse har skickats via e-post och vi
				återkommer om återbetalning och retur.
			</p>
		{:else if data.withdrawable}
			<p class="mt-2 text-sm text-muted-foreground">
				Du har rätt att frånträda köpet inom 14 dagar från det att du tagit emot varorna, utan att
				ange något skäl.
			</p>
			{#if step === 'idle'}
				<Button class="mt-3" variant="outline" onclick={() => (step = 'confirm')}>
					Utöva ångerrätt
				</Button>
			{:else}
				<form
					{...withdraw.enhance(async ({ submit }) => {
						if (await submit()) await invalidateAll();
					})}
					class="mt-3 space-y-3"
				>
					<input type="hidden" name="orderId" value={data.order.id} />
					<input type="hidden" name="token" value={data.token} />
					<p class="text-sm">Bekräfta att du vill frånträda köpet av order #{data.order.id}.</p>
					<div class="space-y-1">
						<label for="wd-name" class="text-sm text-muted-foreground">Ditt namn</label>
						<input
							id="wd-name"
							name="name"
							value={data.order.customerName ?? ''}
							required
							class="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
						/>
						{#each withdraw.fields.name.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
					<div class="flex gap-2">
						<Button type="submit" variant="destructive" disabled={!!withdraw.pending}>
							{withdraw.pending ? 'Skickar…' : 'Bekräfta ångerrätt'}
						</Button>
						<Button type="button" variant="ghost" onclick={() => (step = 'idle')}>Avbryt</Button>
					</div>
				</form>
			{/if}
		{:else}
			<p class="mt-2 text-sm text-muted-foreground">
				Den här ordern kan inte ångras online. Kontakta oss på info@argasso.se vid frågor.
			</p>
		{/if}
	</div>
</div>
