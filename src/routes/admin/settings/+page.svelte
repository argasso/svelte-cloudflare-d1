<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { invalidateAll } from '$app/navigation';
	import { setSyncEnabled } from './settings.remote';

	let { data } = $props();

	// `syncEnabled` comes from the admin layout load, so toggling + invalidateAll
	// keeps this page and the sidebar's Sync entry in lockstep.
	const enabled = $derived(data.syncEnabled);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-3xl font-bold">Settings</h1>
		<p class="text-muted-foreground">Manage how this admin connects to external services</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Shopify integration</Card.Title>
			<Card.Description>
				Controls the entire Shopify connection: the Sync screen, importing from Shopify, pushing
				local edits, and inbound webhooks. Turn it off to run this admin as the sole source of
				truth — existing data stays in place, nothing is pushed or pulled.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex items-center justify-between gap-4">
			<div class="flex items-center gap-2 text-sm">
				<span
					class="inline-block h-2.5 w-2.5 rounded-full {enabled
						? 'bg-green-500'
						: 'bg-muted-foreground'}"
				></span>
				<span class="font-medium">{enabled ? 'Enabled' : 'Disabled'}</span>
			</div>
			<form
				{...setSyncEnabled.enhance(async ({ submit }) => {
					await submit();
					await invalidateAll();
				})}
			>
				<input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
				<Button type="submit" variant={enabled ? 'outline' : 'default'} disabled={!!setSyncEnabled.pending}>
					<RefreshCw class="mr-2 h-4 w-4" />
					{setSyncEnabled.pending ? 'Saving…' : enabled ? 'Disable Shopify sync' : 'Enable Shopify sync'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
