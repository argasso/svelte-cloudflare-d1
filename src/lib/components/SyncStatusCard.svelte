<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { invalidateAll } from '$app/navigation';
	import { revertToShopify } from '../../routes/admin/revert.remote';

	interface Props {
		shopifyId?: string | null;
		/** Shopify's updatedAt as of our last sync (the base version). */
		shopifyUpdatedAt?: string | null;
		/** When we last pushed to / pulled from Shopify. */
		lastSyncedAt?: string | null;
		/** Local edit time — newer than lastSyncedAt means unpushed changes. */
		updatedAt: string;
		/** Entity kind + local id, enabling "Revert to Shopify" when dirty. */
		entityType?: 'product' | 'metaobject';
		entityId?: number;
	}

	let { shopifyId, shopifyUpdatedAt, lastSyncedAt, updatedAt, entityType, entityId }: Props =
		$props();

	const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('sv-SE') : '—');

	// Mirrors the server's isDirty (sync/conflict.ts): a local edit after the last
	// sync is a pending push. No lastSyncedAt means it has never been synced.
	const neverSynced = $derived(!lastSyncedAt);
	const dirty = $derived(
		!!lastSyncedAt && new Date(updatedAt).getTime() > new Date(lastSyncedAt).getTime()
	);

	const status = $derived(neverSynced ? 'Not synced' : dirty ? 'Pending push' : 'In sync');
	const statusClass = $derived(
		neverSynced ? 'text-muted-foreground' : dirty ? 'text-warning' : 'text-success'
	);

	let reverting = $state(false);
	let error = $state<string | null>(null);
	async function revert() {
		if (!entityType || entityId == null) return;
		if (!confirm('Kasta lokala ändringar och hämta versionen från Shopify?')) return;
		reverting = true;
		error = null;
		try {
			await revertToShopify({ type: entityType, id: entityId });
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Kunde inte återställa från Shopify.';
		} finally {
			reverting = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Sync Status</Card.Title>
	</Card.Header>
	<Card.Content>
		<div class="space-y-2 text-sm">
			<div class="flex justify-between">
				<span class="text-muted-foreground">Status:</span>
				<span class="text-xs font-medium {statusClass}">{status}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground">Shopify ID:</span>
				<span class="font-mono text-xs">{shopifyId || 'N/A'}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground">Last synced:</span>
				<span class="text-xs">{fmt(lastSyncedAt)}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground">Shopify updated:</span>
				<span class="text-xs">{fmt(shopifyUpdatedAt)}</span>
			</div>
		</div>

		{#if dirty && entityType && entityId != null}
			<Button variant="outline" size="sm" class="mt-3 w-full" disabled={reverting} onclick={revert}>
				<Undo2 class="mr-2 h-4 w-4" />
				{reverting ? 'Återställer…' : 'Revert to Shopify'}
			</Button>
			{#if error}
				<p class="mt-2 text-xs text-destructive">{error}</p>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
