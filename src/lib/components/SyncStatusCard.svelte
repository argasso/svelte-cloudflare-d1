<script lang="ts">
	import * as Card from '$lib/components/ui/card';

	interface Props {
		shopifyId?: string | null;
		/** Shopify's updatedAt as of our last sync (the base version). */
		shopifyUpdatedAt?: string | null;
		/** When we last pushed to / pulled from Shopify. */
		lastSyncedAt?: string | null;
		/** Local edit time — newer than lastSyncedAt means unpushed changes. */
		updatedAt: string;
	}

	let { shopifyId, shopifyUpdatedAt, lastSyncedAt, updatedAt }: Props = $props();

	const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('sv-SE') : '—');

	// Mirrors the server's isDirty (sync/conflict.ts): a local edit after the last
	// sync is a pending push. No lastSyncedAt means it has never been synced.
	const neverSynced = $derived(!lastSyncedAt);
	const dirty = $derived(!!lastSyncedAt && new Date(updatedAt).getTime() > new Date(lastSyncedAt).getTime());

	const status = $derived(neverSynced ? 'Not synced' : dirty ? 'Pending push' : 'In sync');
	const statusClass = $derived(
		neverSynced ? 'text-muted-foreground' : dirty ? 'text-amber-600' : 'text-green-600'
	);
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
	</Card.Content>
</Card.Root>
