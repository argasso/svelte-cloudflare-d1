<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Image from '@lucide/svelte/icons/image';
	import { invalidateAll } from '$app/navigation';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import Search from '@lucide/svelte/icons/search';
	import { setSyncEnabled, setCheckoutProvider } from './settings.remote';
	import { runMediaMigrationStep } from './media.remote';
	import { rebuildSearch } from '../sync/import.remote';

	let { data } = $props();

	// `syncEnabled` comes from the admin layout load, so toggling + invalidateAll
	// keeps this page and the sidebar's Sync entry in lockstep.
	const enabled = $derived(data.syncEnabled);

	// Active checkout provider (also from the admin layout load).
	const checkoutProvider = $derived(data.checkoutProvider);

	// --- Search index rebuild ---
	let reindexing = $state(false);
	let reindexError = $state<string | null>(null);
	let reindexResult = $state<{ books: number; authors: number; pages: number } | null>(null);

	async function rebuildSearchIndex() {
		reindexing = true;
		reindexError = null;
		try {
			reindexResult = await rebuildSearch();
		} catch (e) {
			reindexError = e instanceof Error ? e.message : String(e);
		} finally {
			reindexing = false;
		}
	}

	// --- Media ownership: copy Shopify-hosted images into R2 (client-driven loop) ---
	let migrating = $state(false);
	let migrateError = $state<string | null>(null);
	let migrateProgress = $state<{ migrated: number; remaining: number } | null>(null);

	async function runMigration() {
		migrating = true;
		migrateError = null;
		let migrated = 0;
		try {
			let remaining = data.media.pending;
			do {
				const r = await runMediaMigrationStep({});
				migrated += r.migrated;
				remaining = r.remaining;
				migrateProgress = { migrated, remaining };
				if (r.failed > 0) migrateError = r.errors.slice(0, 3).join('; ');
				// Stop if a batch made no progress (all failing) to avoid an infinite loop.
				if (r.migrated === 0 && remaining > 0) break;
			} while (remaining > 0);
			await invalidateAll();
		} catch (e) {
			migrateError = e instanceof Error ? e.message : String(e);
		} finally {
			migrating = false;
		}
	}
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
						? 'bg-success'
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Checkout provider</Card.Title>
			<Card.Description>
				Where customers are sent to pay. <strong>Shopify</strong> hands off to Shopify's hosted
				checkout — Shopify owns the order. <strong>Stripe</strong> creates a local pending order and
				a Stripe Checkout session settled by webhook. Switch is instant, no redeploy.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex items-center justify-between gap-4">
			<div class="flex items-center gap-2 text-sm">
				<ShoppingCart class="h-4 w-4 text-muted-foreground" />
				<span class="font-medium capitalize">{checkoutProvider}</span>
			</div>
			<form
				{...setCheckoutProvider.enhance(async ({ submit }) => {
					await submit();
					await invalidateAll();
				})}
			>
				<input
					type="hidden"
					name="provider"
					value={checkoutProvider === 'shopify' ? 'stripe' : 'shopify'}
				/>
				<Button type="submit" variant="outline" disabled={!!setCheckoutProvider.pending}>
					<ShoppingCart class="mr-2 h-4 w-4" />
					{setCheckoutProvider.pending
						? 'Saving…'
						: checkoutProvider === 'shopify'
							? 'Switch to Stripe'
							: 'Switch to Shopify'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Search index</Card.Title>
			<Card.Description>
				Rebuild the full-text (FTS5) index that powers the site-wide search over books,
				authors, and pages. Runs automatically after an import; rebuild here if results look
				stale.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#if reindexResult}
				<div class="flex items-center gap-2 text-sm">
					<span class="inline-block h-2.5 w-2.5 rounded-full bg-success"></span>
					<span class="font-medium">
						{reindexResult.books} books · {reindexResult.authors} authors · {reindexResult.pages} pages
						indexed
					</span>
				</div>
			{/if}
			<Button onclick={rebuildSearchIndex} disabled={reindexing}>
				<Search class="mr-2 h-4 w-4" />
				{reindexing ? 'Rebuilding…' : 'Rebuild search index'}
			</Button>
			{#if reindexError}
				<p class="text-sm text-destructive">{reindexError}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Media ownership</Card.Title>
			<Card.Description>
				Copy images hosted on Shopify's CDN into your own R2 bucket so they're served from this
				site and no longer depend on Shopify. Runs in batches; safe to re-run.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="flex items-center gap-2 text-sm">
				<span
					class="inline-block h-2.5 w-2.5 rounded-full {data.media.pending === 0
						? 'bg-success'
						: 'bg-warning'}"
				></span>
				<span class="font-medium">
					{data.media.owned} of {data.media.total} images owned
				</span>
				{#if data.media.pending > 0}
					<span class="text-muted-foreground">· {data.media.pending} still on Shopify</span>
				{/if}
			</div>

			<Button onclick={runMigration} disabled={migrating || data.media.pending === 0}>
				<Image class="mr-2 h-4 w-4" />
				{#if migrating}
					Copying… ({migrateProgress?.migrated ?? 0} done, {migrateProgress?.remaining ?? '…'} left)
				{:else if data.media.pending === 0}
					All images owned
				{:else}
					Copy {data.media.pending} images into R2
				{/if}
			</Button>

			{#if migrateError}
				<p class="text-sm text-destructive">{migrateError}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
