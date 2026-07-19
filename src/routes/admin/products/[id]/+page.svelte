<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Save from '@lucide/svelte/icons/save';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { invalidateAll } from '$app/navigation';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import type { Metafield, Variant } from '$lib/db/schema';
	import SyncStatusCard from '$lib/components/SyncStatusCard.svelte';
	import MediaManager from '$lib/components/MediaManager.svelte';
	import EnumSelect from '$lib/components/EnumSelect.svelte';
	import MetaobjectSelect from '$lib/components/MetaobjectSelect.svelte';
	import { BINDINGS, AGES, READING_LEVELS } from '$lib/book-fields';
	import { mediaImage } from '$lib/utils/image';
	import { createFormChanges } from '$lib/formChanges.svelte';
	import {
		createVariant,
		deleteVariant,
		updateProduct,
		updateVariant,
		searchAuthors,
		searchCategories
	} from '../products.remote';
	import { setVariantImage } from '../../media.remote';

	async function assignVariantImage(variantId: string, mediaId: number | null) {
		await setVariantImage({ variantId, mediaId });
		await invalidateAll();
	}

	let { data } = $props();
	let { product } = $derived(data);

	let expandedVariants = $state<Set<string>>(new Set([data.product.variants[0]?.id]));

	// Isolated form state per product, so navigating between products doesn't leak state
	let update = $derived(updateProduct.for(String(product.id)));

	// Change tracking: one tracker for the product form, one per variant form
	// (created lazily by id). Gates each Save and shows a Discard when dirty.
	const productChanges = createFormChanges();
	const variantChanges: Record<string, ReturnType<typeof createFormChanges>> = {};
	const changesFor = (id: string) => (variantChanges[id] ??= createFormChanges());
	function discard() {
		if (confirm('Ångra ändringar som inte sparats?')) location.reload();
	}

	function getMetafieldValue(
		variant: Variant & { metafields: Metafield[] },
		namespace: string,
		key: string
	): string {
		const mf = variant.metafields?.find((m) => m.namespace === namespace && m.key === key);
		return mf?.value || '';
	}

	// List metafields are stored as JSON arrays; show comma-separated for editing.
	function getMetafieldList(
		variant: Variant & { metafields: Metafield[] },
		namespace: string,
		key: string
	): string {
		const raw = getMetafieldValue(variant, namespace, key);
		if (!raw) return '';
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr)) return arr.filter(Boolean).join(', ');
		} catch {
			/* not JSON */
		}
		return raw;
	}

	// Resolve a variant's book.category metafield (a JSON array of metaobject
	// gids) to {id, title} pairs for the category picker, via allCategories.
	const categoryByGid = $derived(
		new Map(data.allCategories.filter((c) => c.shopifyId).map((c) => [c.shopifyId, c]))
	);
	function getVariantCategories(variant: Variant & { metafields: Metafield[] }) {
		const raw = getMetafieldValue(variant, 'book', 'category');
		if (!raw) return [];
		let gids: unknown;
		try {
			gids = JSON.parse(raw);
		} catch {
			return [];
		}
		if (!Array.isArray(gids)) return [];
		return gids
			.map((g) => categoryByGid.get(g as string))
			.filter((c): c is NonNullable<typeof c> => !!c)
			.map((c) => ({ id: c.id, title: c.title }));
	}

	function toggleVariant(variantId: string) {
		const newSet = new Set(expandedVariants);
		if (newSet.has(variantId)) {
			newSet.delete(variantId);
		} else {
			newSet.add(variantId);
		}
		expandedVariants = newSet;
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<Button variant="ghost" size="icon" href="/admin/products">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-bold sm:text-3xl">{product.title}</h1>
				<p class="truncate text-sm text-muted-foreground">
					Product ID: {product.id}
					{#if data.syncEnabled && product.shopifyId}
						• Shopify ID: {product.shopifyId}
					{/if}
				</p>
			</div>
		</div>
		<div class="flex gap-2 self-end sm:self-auto">
			{#if productChanges.dirty}
				<Button type="button" variant="outline" onclick={discard}>
					<Undo2 class="mr-2 h-4 w-4" />
					Discard
				</Button>
			{/if}
			<Button type="submit" form="product-form" disabled={!!update.pending || !productChanges.dirty}>
				<Save class="mr-2 h-4 w-4" />
				Save Changes
			</Button>
		</div>
	</div>

	<!--
		The product form element is empty; its inputs are associated via the
		form="product-form" attribute. This keeps variant forms as siblings
		instead of (invalid) nested forms.
	-->
	<form
		id="product-form"
		use:productChanges.attach
		{...update.enhance(async ({ submit }) => {
			if (await submit()) {
				await invalidateAll();
				productChanges.markSaved();
			}
		})}
	>
		<input type="hidden" name="id" value={product.id} />
	</form>

	<div class="grid gap-4 md:grid-cols-3">
		<!-- Main content -->
		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input
							id="title"
							form="product-form"
							{...update.fields.title.as('text', product.title)}
						/>
						{#each update.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="description">Description</Label>
						<RichTextEditor
							name="description"
							format="html"
							form="product-form"
							value={product.description}
							placeholder="Product description…"
						/>
						{#each update.fields.description.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label>Authors</Label>
						<MetaobjectSelect
							name="authors[]"
							form="product-form"
							search={searchAuthors}
							placeholder="Sök författare…"
							emptyText="Inga författare hittades."
							initial={data.authors.map((a) => ({ id: a.metaobject.id, title: a.metaobject.title }))}
						/>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Search engine listing (SEO)</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="seoTitle">SEO title</Label>
						<Input
							id="seoTitle"
							form="product-form"
							placeholder={product.title}
							{...update.fields.seoTitle.as('text', product.seoTitle ?? '')}
						/>
						<p class="text-xs text-muted-foreground">Lämna tomt för att använda boktiteln.</p>
					</div>
					<div class="space-y-2">
						<Label for="seoDescription">SEO description</Label>
						<textarea
							id="seoDescription"
							name="seoDescription"
							form="product-form"
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>{product.seoDescription ?? ''}</textarea
						>
						<p class="text-xs text-muted-foreground">
							Visas i sökresultat. Lämna tomt för att använda ett utdrag ur beskrivningen.
						</p>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Variants -->
			{#each product.variants as variant (variant.id)}
				{@const variantForm = updateVariant.for(variant.id)}
				{@const vChanges = changesFor(variant.id)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<Card.Title>
									<button
										type="button"
										onclick={() => toggleVariant(variant.id)}
										class="flex items-center gap-2 hover:underline"
									>
										{#if expandedVariants.has(variant.id)}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
										{variant.title}
									</button>
								</Card.Title>
								<Card.Description>
									{variant.price} SEK • SKU/ISBN: {variant.sku || 'N/A'} • Stock: {variant.inventoryQuantity ||
										0}
								</Card.Description>
							</div>
							<div class="flex items-center gap-2">
								{#if product.variants.length > 1}
									{@const del = deleteVariant.for(variant.id)}
									<form
										{...del.enhance(async ({ submit }) => {
											if (!confirm(`Delete variant "${variant.title}"? This cannot be undone.`))
												return;
											if (await submit()) await invalidateAll();
										})}
									>
										<input type="hidden" name="variantId" value={variant.id} />
										<Button
											type="submit"
											variant="ghost"
											size="sm"
											disabled={!!del.pending}
											class="text-destructive hover:bg-destructive/10 hover:text-destructive"
										>
											<Trash class="mr-2 h-4 w-4" />
											Delete
										</Button>
									</form>
								{/if}
								{#if vChanges.dirty}
									<Button type="button" variant="outline" size="sm" onclick={discard}>
										<Undo2 class="mr-2 h-4 w-4" />
										Discard
									</Button>
								{/if}
								<Button
									type="submit"
									form="variant-form-{variant.id}"
									size="sm"
									disabled={!!variantForm.pending || !vChanges.dirty}
								>
									<Save class="mr-2 h-4 w-4" />
									Save
								</Button>
							</div>
						</div>
					</Card.Header>

					{#if expandedVariants.has(variant.id)}
						<Card.Content>
							<form
								id="variant-form-{variant.id}"
								use:vChanges.attach
								{...variantForm.enhance(async ({ submit }) => {
									if (await submit()) {
										await invalidateAll();
										vChanges.markSaved();
									}
								})}
								class="space-y-6"
							>
								<input type="hidden" name="variantId" value={variant.id} />

								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Basic Information</h3>
									<div class="grid gap-4 md:grid-cols-2">
										<div class="space-y-2">
											<Label for="price-{variant.id}">Price (SEK) *</Label>
											<Input
												id="price-{variant.id}"
												inputmode="decimal"
												{...variantForm.fields.price.as('text', String(variant.price))}
											/>
											{#each variantForm.fields.price.issues() ?? [] as issue (issue.message)}
												<p class="text-sm text-destructive">{issue.message}</p>
											{/each}
										</div>

										<div class="space-y-2">
											<Label for="sku-{variant.id}">SKU</Label>
											<Input
												id="sku-{variant.id}"
												inputmode="numeric"
												placeholder="Endast siffror"
												{...variantForm.fields.sku.as('text', variant.sku ?? '')}
											/>
											{#each variantForm.fields.sku.issues() ?? [] as issue (issue.message)}
												<p class="text-sm text-destructive">{issue.message}</p>
											{/each}
										</div>

										<div class="space-y-2">
											<Label for="barcode-{variant.id}">ISBN</Label>
											<Input
												id="barcode-{variant.id}"
												placeholder="t.ex. 978-91-85071-85-2"
												{...variantForm.fields.barcode.as('text', variant.barcode ?? '')}
											/>
											{#each variantForm.fields.barcode.issues() ?? [] as issue (issue.message)}
												<p class="text-sm text-destructive">{issue.message}</p>
											{/each}
										</div>
									</div>

									<div class="space-y-2">
										<Label>Categories</Label>
										<MetaobjectSelect
											name="categories[]"
											form="variant-form-{variant.id}"
											search={searchCategories}
											placeholder="Sök kategori…"
											emptyText="Inga kategorier hittades."
											initial={getVariantCategories(variant)}
										/>
									</div>

									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											name="discontinued"
											value="true"
											checked={getMetafieldValue(variant, 'book', 'discontinued') === 'true'}
											class="h-4 w-4 rounded border-gray-300"
										/>
										Utgången (säljs inte längre)
									</label>
								</div>

								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Book Details</h3>
									<div class="grid gap-4 md:grid-cols-2">
										<div class="space-y-2">
											<Label for="binding-{variant.id}">Binding</Label>
											<EnumSelect
												id="binding-{variant.id}"
												name="binding"
												options={BINDINGS}
												initial={getMetafieldValue(variant, 'book', 'binding')}
											/>
										</div>

										<div class="space-y-2">
											<Label for="numberOfPages-{variant.id}">Number of Pages</Label>
											<Input
												id="numberOfPages-{variant.id}"
												inputmode="numeric"
												{...variantForm.fields.numberOfPages.as(
													'text',
													getMetafieldValue(variant, 'book', 'number_of_pages')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="age-{variant.id}">Age</Label>
											<EnumSelect
												id="age-{variant.id}"
												name="age"
												options={AGES}
												initial={getMetafieldValue(variant, 'book', 'age')}
											/>
										</div>

										<div class="space-y-2">
											<Label for="publishMonth-{variant.id}">Publish Date</Label>
											<Input
												id="publishMonth-{variant.id}"
												{...variantForm.fields.publishMonth.as(
													'date',
													getMetafieldValue(variant, 'book', 'publish_month')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="readingLevel-{variant.id}">Reading Level (Lättlästnivå)</Label>
											<EnumSelect
												id="readingLevel-{variant.id}"
												name="readingLevel"
												options={READING_LEVELS}
												initial={getMetafieldValue(variant, 'book', 'reading_level')}
											/>
										</div>

										<div class="space-y-2">
											<Label for="illustrationsBy-{variant.id}">Illustrated By</Label>
											<Input
												id="illustrationsBy-{variant.id}"
												placeholder="Separera flera med komma"
												{...variantForm.fields.illustrationsBy.as(
													'text',
													getMetafieldList(variant, 'book', 'illustrations_by')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="editedBy-{variant.id}">Edited By</Label>
											<Input
												id="editedBy-{variant.id}"
												placeholder="Separera flera med komma"
												{...variantForm.fields.editedBy.as(
													'text',
													getMetafieldList(variant, 'book', 'edited_by')
												)}
											/>
										</div>
									</div>
								</div>

								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Translation Details (if applicable)</h3>
									<div class="grid gap-4 md:grid-cols-2">
										<div class="space-y-2">
											<Label for="originalTitle-{variant.id}">Original Title</Label>
											<Input
												id="originalTitle-{variant.id}"
												{...variantForm.fields.originalTitle.as(
													'text',
													getMetafieldValue(variant, 'translated_book', 'original_title')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="translatedBy-{variant.id}">Translated By</Label>
											<Input
												id="translatedBy-{variant.id}"
												{...variantForm.fields.translatedBy.as(
													'text',
													getMetafieldValue(variant, 'translated_book', 'translated_by')
												)}
											/>
										</div>
									</div>
								</div>

								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Audiobook (if applicable)</h3>
									<div class="grid gap-4 md:grid-cols-2">
										<div class="space-y-2">
											<Label for="narratedBy-{variant.id}">Narrated By (Uppläsare)</Label>
											<Input
												id="narratedBy-{variant.id}"
												{...variantForm.fields.narratedBy.as(
													'text',
													getMetafieldValue(variant, 'audio_book', 'narrated_by')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="duration-{variant.id}">Duration (Speltid)</Label>
											<Input
												id="duration-{variant.id}"
												placeholder="t.ex. 1 tim 20 min"
												{...variantForm.fields.duration.as(
													'text',
													getMetafieldValue(variant, 'audio_book', 'duration')
												)}
											/>
										</div>
									</div>
								</div>
							</form>

							<div class="mt-6 space-y-3 border-t pt-4">
								<h3 class="text-lg font-semibold">Variant image</h3>
								{#if data.media.length === 0}
									<p class="text-sm text-muted-foreground">
										Upload product images first (in the Images card), then pick one here.
									</p>
								{:else}
									<div class="flex flex-wrap gap-2">
										<button
											type="button"
											onclick={() => assignVariantImage(variant.id, null)}
											class="flex h-16 w-16 items-center justify-center rounded-md border p-1 text-center text-[10px] leading-tight text-muted-foreground {variant.imageId ==
											null
												? 'ring-2 ring-primary'
												: ''}"
										>
											Product default
										</button>
										{#each data.media as image (image.id)}
											<button
												type="button"
												onclick={() => assignVariantImage(variant.id, image.id)}
												class="overflow-hidden rounded-md border {variant.imageId === image.id
													? 'ring-2 ring-primary'
													: ''}"
											>
												<img
													src={mediaImage(image, 'thumb')}
													alt={image.altText ?? ''}
													class="h-16 w-16 object-cover"
													loading="lazy"
												/>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{:else}
				<Card.Root>
					<Card.Header>
						<Card.Title>Variants</Card.Title>
					</Card.Header>
					<Card.Content>
						<p class="text-sm text-muted-foreground">No variants yet</p>
					</Card.Content>
				</Card.Root>
			{/each}

			<Card.Root>
				<Card.Header>
					<Card.Title>Add variant</Card.Title>
					<Card.Description>
						New variants inherit the product's option shape (e.g. "Format"). Set metadata,
						SKU/ISBN and images after creation.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form
						{...createVariant.enhance(async ({ submit }) => {
							if (await submit()) await invalidateAll();
						})}
						class="flex flex-col gap-3 sm:flex-row sm:items-end"
					>
						<input type="hidden" name="productId" value={product.id} />
						<div class="flex-1 space-y-1.5">
							<Label for="new-variant-title">Title *</Label>
							<Input
								id="new-variant-title"
								placeholder="e.g., E-bok, Danskt band, Ljudbok…"
								{...createVariant.fields.title.as('text', '')}
							/>
							{#each createVariant.fields.title.issues() ?? [] as issue (issue.message)}
								<p class="text-sm text-destructive">{issue.message}</p>
							{/each}
						</div>
						<div class="space-y-1.5 sm:w-32">
							<Label for="new-variant-price">Price (SEK) *</Label>
							<Input
								id="new-variant-price"
								inputmode="decimal"
								placeholder="0"
								{...createVariant.fields.price.as('text', '0')}
							/>
							{#each createVariant.fields.price.issues() ?? [] as issue (issue.message)}
								<p class="text-sm text-destructive">{issue.message}</p>
							{/each}
						</div>
						<Button type="submit" disabled={!!createVariant.pending}>
							<Plus class="mr-2 h-4 w-4" />
							{createVariant.pending ? 'Adding…' : 'Add variant'}
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Sidebar -->
		<div class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Status</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						name="status"
						form="product-form"
						value={product.status}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="Draft">Draft</option>
						<option value="Active">Active</option>
						<option value="Archived">Archived</option>
					</select>
				</Card.Content>
			</Card.Root>

			<MediaManager entityType="product" entityId={product.id} media={data.media} />

			{#if data.syncEnabled}
				<SyncStatusCard
					entityType="product"
					entityId={product.id}
					shopifyId={product.shopifyId}
					shopifyUpdatedAt={product.shopifyUpdatedAt}
					lastSyncedAt={product.lastSyncedAt}
					updatedAt={product.updatedAt}
				/>
			{/if}
		</div>
	</div>
</div>
