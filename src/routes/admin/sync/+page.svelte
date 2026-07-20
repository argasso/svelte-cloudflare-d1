<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Download from '@lucide/svelte/icons/download';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { invalidateAll } from '$app/navigation';
	import { pushSync } from './sync.remote';
	import { runImportStep } from './import.remote';
	import { revertToShopify } from '../revert.remote';

	let { data } = $props();

	// Revert a pending entry to Shopify's current version. Reverting is product-
	// scoped: a product entry restores the product AND all its variants in one go
	// (hence the list groups variants under their product). Keyed by entry so only
	// the clicked one shows a spinner.
	let reverting = $state<string | null>(null);
	async function revert(row: (typeof data.dirty)[number]) {
		const key = row.kind + ':' + row.id;
		const msg =
			row.kind === 'product' && (row.variants?.length ?? 0) > 0
				? 'Kasta lokala ändringar för produkten och alla dess varianter och hämta versionen från Shopify?'
				: 'Kasta lokala ändringar och hämta versionen från Shopify?';
		if (!confirm(msg)) return;
		reverting = key;
		try {
			await revertToShopify({ type: row.revertTarget.type, id: row.revertTarget.id });
			await invalidateAll();
		} finally {
			reverting = null;
		}
	}

	// --- Import from Shopify (client-driven, ordered: authors → pages → products → links) ---
	let importing = $state(false);
	let importError = $state<string | null>(null);
	let importProgress = $state<{ step: string; authors?: number; pages?: number; products?: number; links?: number }>({
		step: ''
	});

	async function runImport() {
		importing = true;
		importError = null;
		importProgress = { step: 'Starting…' };
		try {
			let r = await runImportStep({ step: 'authors' });
			importProgress = { ...importProgress, authors: r.imported, step: 'Importing pages…' };

			r = await runImportStep({ step: 'pages' });
			importProgress = { ...importProgress, pages: r.imported, step: 'Importing products…' };

			let products = 0;
			let cursor: string | undefined;
			do {
				r = await runImportStep({ step: 'products', cursor });
				products += r.imported;
				cursor = r.cursor ?? undefined;
				importProgress = { ...importProgress, products, step: `Importing products… (${products})` };
			} while (r.next === 'products');

			let links = 0;
			let linkCursor: string | undefined;
			do {
				r = await runImportStep({ step: 'links', cursor: linkCursor });
				links += r.imported;
				linkCursor = r.cursor ?? undefined;
				importProgress = { ...importProgress, links, step: `Linking… (${links})` };
			} while (r.next === 'links');

			importProgress = { ...importProgress, step: 'Done' };
			await invalidateAll();
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importing = false;
		}
	}

	const typeLabel: Record<string, string> = {
		product: 'Product',
		variant: 'Variant',
		metaobject: 'Page / Author'
	};

	// Pill tint per entity kind for the Type column.
	const kindLabel: Record<string, string> = {
		product: 'Product',
		metaobject: 'Page / Author'
	};
	const kindPill: Record<string, string> = {
		product: 'border-blue-200 bg-blue-50 text-blue-700',
		metaobject: 'border-emerald-200 bg-emerald-50 text-emerald-700'
	};

	const entryHref = (row: (typeof data.dirty)[number]) =>
		row.kind === 'product' ? `/admin/products/${row.id}` : `/admin/pages/${row.id}`;

	// Sub-line under a product row: what's dirty (product fields and/or which
	// variants), so the folded-in variant changes are visible without listing
	// variants as separately-revertable rows.
	const entrySummary = (row: (typeof data.dirty)[number]): string | null => {
		if (row.kind !== 'product') return null;
		const vs = row.variants ?? [];
		const parts: string[] = [];
		if (row.productDirty) parts.push('Produktuppgifter');
		if (vs.length > 0) {
			const names = vs.map((v) => v.title ?? 'Variant').join(', ');
			parts.push(`${vs.length} ${vs.length === 1 ? 'variant' : 'varianter'}: ${names}`);
		}
		return parts.join(' · ') || null;
	};

	const pushAll = pushSync.for('all');

	function badgeClass(action: string) {
		if (action === 'pushed') return 'text-green-600';
		if (action === 'conflict') return 'text-amber-600';
		if (action === 'failed') return 'text-destructive';
		return 'text-muted-foreground';
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Sync</h1>
			<p class="text-muted-foreground">Push local changes to Shopify</p>
		</div>
		<form
			{...pushAll.enhance(async ({ submit }) => {
				await submit();
				await invalidateAll();
			})}
		>
			<input type="hidden" name="type" value="" />
			<input type="hidden" name="id" value="" />
			<Button type="submit" disabled={!!pushAll.pending || data.dirty.length === 0}>
				<RefreshCw class="mr-2 h-4 w-4" />
				{pushAll.pending ? 'Pushing…' : `Push all (${data.dirty.length})`}
			</Button>
		</form>
	</div>

	<div
		class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
	>
		<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
		<span>
			Pushing writes to the <strong>production</strong> Shopify store. Changes made in Shopify
			since the last sync are detected and shown as conflicts instead of being overwritten.
		</span>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Import from Shopify</Card.Title>
			<Card.Description>
				Pull authors, pages, products and variants from Shopify into this database (authors and
				pages first, then products). Rows with unpushed local edits are skipped.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			<Button onclick={runImport} disabled={importing}>
				<Download class="mr-2 h-4 w-4" />
				{importing ? importProgress.step : 'Import from Shopify'}
			</Button>
			{#if importProgress.authors !== undefined || importProgress.links !== undefined}
				<p class="text-sm text-muted-foreground">
					Authors {importProgress.authors ?? '…'} · Pages {importProgress.pages ?? '…'} · Products
					{importProgress.products ?? '…'} · Links {importProgress.links ?? '…'}
					{#if importProgress.step === 'Done'}<span class="text-green-600"> ✓</span>{/if}
				</p>
			{/if}
			{#if importError}
				<p class="text-sm text-destructive">{importError}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if pushAll.result}
		{@const s = pushAll.result.summary}
		<Card.Root>
			<Card.Header>
				<Card.Title>Last push</Card.Title>
				<Card.Description>
					{s.pushed} pushed · {s.conflict} conflict · {s.failed} failed · {s.skipped} skipped
				</Card.Description>
			</Card.Header>
			{#if s.conflict > 0 || s.failed > 0}
				<Card.Content>
					<ul class="space-y-1 text-sm">
						{#each pushAll.result.entries.filter((e) => e.action !== 'pushed') as e (e.type + e.title)}
							<li>
								<span class={badgeClass(e.action)}>{e.action}</span>
								— {typeLabel[e.type]}: {e.title}
								{#if e.error}<span class="text-muted-foreground">({e.error})</span>{/if}
							</li>
						{/each}
					</ul>
				</Card.Content>
			{/if}
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Pending changes ({data.dirty.length})</Card.Title>
			<Card.Description>Rows edited locally since the last sync</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.dirty.length === 0}
				<p class="text-sm text-muted-foreground">Nothing to sync — everything is up to date.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Title</Table.Head>
							<Table.Head class="w-[130px]">Type</Table.Head>
							<Table.Head>Edited</Table.Head>
							<Table.Head class="w-[220px]">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.dirty as row (row.kind + ':' + row.id)}
							{@const key = row.kind + ':' + String(row.id)}
							{@const f = pushSync.for(key)}
							{@const href = entryHref(row)}
							{@const summary = entrySummary(row)}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a {href} class="hover:underline">{row.title ?? row.id}</a>
									{#if summary}
										<p class="mt-0.5 text-xs font-normal text-muted-foreground">{summary}</p>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<span
										class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {kindPill[
											row.kind
										]}"
									>
										{kindLabel[row.kind]}
									</span>
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{new Date(row.updatedAt).toLocaleString('sv-SE')}
								</Table.Cell>
								<Table.Cell>
									<div class="flex items-center gap-2">
										<form
											{...f.enhance(async ({ submit }) => {
												await submit();
												await invalidateAll();
											})}
										>
											{#if row.kind === 'product'}
												<input type="hidden" name="productId" value={row.id} />
											{:else}
												<input type="hidden" name="type" value={row.kind} />
												<input type="hidden" name="id" value={row.id} />
											{/if}
											<Button type="submit" variant="outline" size="sm" disabled={!!f.pending}>
												{f.pending ? 'Pushing…' : 'Push'}
											</Button>
										</form>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={reverting === key}
											onclick={() => revert(row)}
										>
											<Undo2 class="mr-1 h-3.5 w-3.5" />
											{reverting === key ? 'Reverting…' : 'Revert'}
										</Button>
									</div>
									{#if f.result && f.result.entries[0] && f.result.entries[0].action !== 'pushed'}
										<p class="mt-1 text-xs {badgeClass(f.result.entries[0].action)}">
											{f.result.entries[0].action}{f.result.entries[0].error
												? `: ${f.result.entries[0].error}`
												: ''}
										</p>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent activity</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.recent.length === 0}
				<p class="text-sm text-muted-foreground">No sync activity yet.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>When</Table.Head>
							<Table.Head>Type</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Detail</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.recent as entry (entry.id)}
							<Table.Row>
								<Table.Cell class="text-sm text-muted-foreground">
									{new Date(entry.timestamp).toLocaleString('sv-SE')}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{typeLabel[entry.entityType]}</Table.Cell>
								<Table.Cell
									class="text-sm {entry.status === 'success'
										? 'text-green-600'
										: entry.status === 'failed'
											? 'text-destructive'
											: 'text-amber-600'}"
								>
									{entry.status}
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{entry.errorMessage ?? ''}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
