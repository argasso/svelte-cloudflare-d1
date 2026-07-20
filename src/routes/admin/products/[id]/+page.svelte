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
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
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
		copyVariantMetafields,
		createVariant,
		deleteVariant,
		saveProduct,
		searchAuthors,
		searchCategories
	} from '../products.remote';

	let { data } = $props();
	let { product } = $derived(data);

	// Isolated form + tracker state per product, so navigating between products
	// doesn't leak state. A single form carries product-level fields AND every
	// variant, so one Save button submits the whole thing in one request.
	let save = $derived(saveProduct.for(String(product.id)));
	const changes = createFormChanges({ settleBeforeBaseline: true });
	const anyDirty = $derived(changes.dirty);
	const anyPending = $derived(!!save.pending);

	// Per-variant image selection lives here until save. Undefined => no pending
	// change, fall back to variant.imageId from the server. The variant's hidden
	// imageId input reflects this and submits with the unified form.
	const pendingImages = $state<Record<string, number | null>>({});
	function imageFor(v: Variant & { metafields: Metafield[] }): number | null {
		return v.id in pendingImages ? pendingImages[v.id] : (v.imageId ?? null);
	}
	async function selectVariantImage(variantId: string, mediaId: number | null) {
		pendingImages[variantId] = mediaId;
		// After Svelte reflows the hidden input's value, fire an input event on it
		// so the form-dirty tracker registers the change.
		await tick();
		document
			.getElementById(`variant-image-${variantId}`)
			?.dispatchEvent(new Event('input', { bubbles: true }));
	}

	// Which variant tab is currently visible. `__new__` is the pseudo-tab used
	// for the "Add variant" form. Defaults to the first real variant on mount;
	// re-anchors if a variant is added/removed so the DOM never points at a
	// vanished id.
	const NEW_TAB = '__new__';
	let activeTab = $state<string>(data.product.variants[0]?.id ?? NEW_TAB);
	function selectTab(id: string) {
		activeTab = id;
	}
	$effect(() => {
		if (activeTab === NEW_TAB) return;
		if (!product.variants.some((v) => v.id === activeTab)) {
			activeTab = product.variants[0]?.id ?? NEW_TAB;
		}
	});

	function discard() {
		if (confirm('Ångra ändringar som inte sparats?')) location.reload();
	}

	// Save: submit the one form; its enhance handler invalidates + re-baselines.
	async function onSaved() {
		await invalidateAll();
		await tick();
		changes.markSaved();
		for (const k of Object.keys(pendingImages)) delete pendingImages[k];
	}

	// createVariant / deleteVariant / copyVariantMetafields are commands (button-
	// driven mutations that add/remove/replace variants — structural changes that
	// sit outside the edit-and-save flow). After each we reload the page data and
	// re-baseline the tracker to the fresh DOM so dirty stays accurate.
	function errMessage(e: unknown): string {
		const body = (e as { body?: { message?: string } })?.body;
		return body?.message ?? (e instanceof Error ? e.message : 'Något gick fel');
	}
	async function afterStructuralChange() {
		await invalidateAll();
		await tick();
		changes.markSaved();
	}

	let deleting = $state(false);
	async function removeVariant(variant: Variant & { metafields: Metafield[] }) {
		if (!confirm(`Delete variant "${variant.title}"? This cannot be undone.`)) return;
		deleting = true;
		try {
			await deleteVariant({ variantId: variant.id });
			await afterStructuralChange();
		} catch (e) {
			alert(errMessage(e));
		} finally {
			deleting = false;
		}
	}

	async function copyFrom(
		target: Variant & { metafields: Metafield[] },
		sourceId: string,
		sourceTitle: string
	) {
		if (!sourceId) return;
		if (
			!confirm(
				`Kopiera bokdata från "${sourceTitle}" till "${target.title}"? Nuvarande värden skrivs över.`
			)
		)
			return;
		try {
			await copyVariantMetafields({ sourceVariantId: sourceId, targetVariantId: target.id });
			await afterStructuralChange();
		} catch (e) {
			alert(errMessage(e));
		}
	}

	// Add-variant draft state (nameless controls — not part of the tracked form).
	let newFormat = $state('');
	let newPrice = $state('0');
	let newVariantError = $state('');
	let adding = $state(false);
	async function addVariant() {
		newVariantError = '';
		if (!newFormat) {
			newVariantError = 'Välj format';
			return;
		}
		adding = true;
		try {
			await createVariant({ productId: String(product.id), title: newFormat, price: newPrice });
			newFormat = '';
			newPrice = '0';
			await afterStructuralChange();
		} catch (e) {
			newVariantError = errMessage(e);
		} finally {
			adding = false;
		}
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

	// Read the variant's current "format" — a single admin control drives both
	// the variant title and the book.binding metafield. A variant still on
	// Shopify's default title ("Default Title") with no binding counts as unpicked
	// (empty), surfacing the enum placeholder rather than "Default Title".
	function getVariantFormat(variant: Variant & { metafields: Metafield[] }): string {
		const binding = getMetafieldValue(variant, 'book', 'binding');
		if (binding) return binding;
		if (variant.title && variant.title !== 'Default Title') return variant.title;
		return '';
	}
	const soleVariantNeedsFormat = $derived(
		product.variants.length === 1 && getVariantFormat(product.variants[0]) === ''
	);

	// Formats already in use across the product's variants — each is unique
	// (Shopify requires distinct option values). For a variant's own Format select
	// we still include its current value; the Add-variant select filters to the
	// strictly unused options.
	const usedFormats = $derived(
		new Set(product.variants.map((v) => getVariantFormat(v)).filter(Boolean))
	);
	function formatsFor(variant: Variant & { metafields: Metafield[] }): string[] {
		const own = getVariantFormat(variant);
		return BINDINGS.filter((b) => !usedFormats.has(b) || b === own);
	}
	const availableFormatsForNew = $derived(BINDINGS.filter((b) => !usedFormats.has(b)));
	const canAddVariant = $derived(!soleVariantNeedsFormat && availableFormatsForNew.length > 0);

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
</script>

<div class="flex flex-col gap-4">
	<div
		class="sticky top-0 z-30 -mx-4 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:gap-4"
	>
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
			{#if anyDirty}
				<Button type="button" variant="outline" onclick={discard}>
					<Undo2 class="mr-2 h-4 w-4" />
					Discard
				</Button>
			{/if}
			<Button type="submit" form="product-form" disabled={anyPending || !anyDirty}>
				<Save class="mr-2 h-4 w-4" />
				Save Changes
			</Button>
		</div>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<!-- One form covers product fields + every variant. The sidebar's Status
		     control is associated via form="product-form" (it can't be nested,
		     because MediaManager below contains its own forms). -->
		<form
			id="product-form"
			class="space-y-4 md:col-span-2"
			{@attach changes.attach}
			{...save.enhance(async ({ submit }) => {
				if (await submit()) await onSaved();
			})}
		>
			<input type="hidden" name="id" value={product.id} />

			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input id="title" {...save.fields.title.as('text', product.title)} />
						{#each save.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="description">Description</Label>
						<RichTextEditor
							name="description"
							format="html"
							value={product.description}
							placeholder="Product description…"
						/>
						{#each save.fields.description.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label>Authors</Label>
						<MetaobjectSelect
							name="authors[]"
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
							placeholder={product.title}
							{...save.fields.seoTitle.as('text', product.seoTitle ?? '')}
						/>
						<p class="text-xs text-muted-foreground">Lämna tomt för att använda boktiteln.</p>
					</div>
					<div class="space-y-2">
						<Label for="seoDescription">SEO description</Label>
						<textarea
							id="seoDescription"
							name="seoDescription"
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

			<!-- Variants: one shared Card holds the tab strip + active-variant
			     action buttons in its header, then the panels stacked in its
			     content. Panels stay mounted (visibility toggled via style:display)
			     so switching tabs doesn't discard unsaved edits. -->
			<Card.Root class="pt-1">
				<Card.Header class="p-0">
					<div class="flex flex-wrap items-center justify-between gap-2 border-b-2">
						<div class="flex flex-wrap items-center gap-1" role="tablist">
							{#each product.variants as v (v.id)}
								{@const isActive = activeTab === v.id}
								<button
									type="button"
									role="tab"
									aria-selected={isActive}
									onclick={() => selectTab(v.id)}
									class={'border-b-2 px-6 py-2 text-sm font-medium transition-colors ' +
										(isActive
											? 'border-primary text-foreground'
											: 'border-transparent text-muted-foreground hover:text-foreground')}
								>
									{v.title || 'Ny variant'}
								</button>
							{/each}
							{#if canAddVariant}
								{@const isActive = activeTab === NEW_TAB}
								<button
									type="button"
									role="tab"
									aria-selected={isActive}
									onclick={() => selectTab(NEW_TAB)}
									class={'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
										(isActive
											? 'border-primary text-foreground'
											: 'border-transparent text-muted-foreground hover:text-foreground')}
								>
									<Plus class="mr-1 inline h-4 w-4" />
									Ny variant
								</button>
							{/if}
						</div>

						{#if activeTab !== NEW_TAB}
							{@const activeVariant = product.variants.find((v) => v.id === activeTab)}
							{#if activeVariant && product.variants.length > 1}
								{@const siblings = product.variants.filter((v) => v.id !== activeVariant.id)}
								<div class="flex items-center gap-2">
									<select
										onchange={(e) => {
											const src = e.currentTarget.value;
											e.currentTarget.value = '';
											const srcTitle = siblings.find((s) => s.id === src)?.title ?? 'variant';
											copyFrom(activeVariant, src, srcTitle);
										}}
										class="h-8 rounded-md border border-input bg-background px-2 text-xs"
										aria-label="Kopiera bokdata från…"
									>
										<option value="">Kopiera från…</option>
										{#each siblings as s (s.id)}
											<option value={s.id}>{s.title || 'Variant'}</option>
										{/each}
									</select>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={deleting}
										onclick={() => removeVariant(activeVariant)}
										class="text-destructive hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash class="mr-2 h-4 w-4" />
										Delete
									</Button>
								</div>
							{/if}
						{/if}
					</div>
				</Card.Header>

				<Card.Content class="space-y-6">
					{#each product.variants as variant, i (variant.id)}
						{@const vf = save.fields.variants[i]}
						<div
							style:display={activeTab === variant.id ? undefined : 'none'}
							class="space-y-6"
						>
							<input type="hidden" name="variants[{i}].variantId" value={variant.id} />
							<input
								type="hidden"
								id="variant-image-{variant.id}"
								name="variants[{i}].imageId"
								value={imageFor(variant) ?? ''}
							/>

							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Basic Information</h3>
								<!-- Format drives both variant.title AND the book.binding metafield. -->
								<div class="space-y-2">
									<Label for="format-{variant.id}">Format</Label>
									<EnumSelect
										id="format-{variant.id}"
										name="variants[{i}].binding"
										options={formatsFor(variant)}
										placeholder="Välj format…"
										initial={getVariantFormat(variant)}
									/>
									<p class="text-xs text-muted-foreground">
										Uppdaterar både variantens titel och metadata "book.binding".
									</p>
								</div>
								<div class="grid gap-4 md:grid-cols-2">
									<div class="space-y-2">
										<Label for="price-{variant.id}">Price (SEK) *</Label>
										<Input
											id="price-{variant.id}"
											inputmode="decimal"
											{...vf.price.as('text', String(variant.price))}
										/>
										{#each vf.price.issues() ?? [] as issue (issue.message)}
											<p class="text-sm text-destructive">{issue.message}</p>
										{/each}
									</div>

									<div class="space-y-2">
										<Label for="sku-{variant.id}">SKU</Label>
										<Input
											id="sku-{variant.id}"
											inputmode="numeric"
											placeholder="Endast siffror"
											{...vf.sku.as('text', variant.sku ?? '')}
										/>
										{#each vf.sku.issues() ?? [] as issue (issue.message)}
											<p class="text-sm text-destructive">{issue.message}</p>
										{/each}
									</div>

									<div class="space-y-2">
										<Label for="barcode-{variant.id}">ISBN</Label>
										<Input
											id="barcode-{variant.id}"
											placeholder="t.ex. 978-91-85071-85-2"
											{...vf.barcode.as('text', variant.barcode ?? '')}
										/>
										{#each vf.barcode.issues() ?? [] as issue (issue.message)}
											<p class="text-sm text-destructive">{issue.message}</p>
										{/each}
									</div>
								</div>

								<div class="space-y-2">
									<Label>Categories</Label>
									<MetaobjectSelect
										name="variants[{i}].categories[]"
										search={searchCategories}
										placeholder="Sök kategori…"
										emptyText="Inga kategorier hittades."
										initial={getVariantCategories(variant)}
									/>
								</div>

								<label class="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										name="variants[{i}].discontinued"
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
										<Label for="numberOfPages-{variant.id}">Number of Pages</Label>
										<Input
											id="numberOfPages-{variant.id}"
											inputmode="numeric"
											{...vf.numberOfPages.as(
												'text',
												getMetafieldValue(variant, 'book', 'number_of_pages')
											)}
										/>
									</div>

									<div class="space-y-2">
										<Label for="age-{variant.id}">Age</Label>
										<EnumSelect
											id="age-{variant.id}"
											name="variants[{i}].age"
											options={AGES}
											initial={getMetafieldValue(variant, 'book', 'age')}
										/>
									</div>

									<div class="space-y-2">
										<Label for="publishMonth-{variant.id}">Publish Date</Label>
										<Input
											id="publishMonth-{variant.id}"
											{...vf.publishMonth.as(
												'date',
												getMetafieldValue(variant, 'book', 'publish_month')
											)}
										/>
									</div>

									<div class="space-y-2">
										<Label for="readingLevel-{variant.id}">Reading Level (Lättlästnivå)</Label>
										<EnumSelect
											id="readingLevel-{variant.id}"
											name="variants[{i}].readingLevel"
											options={READING_LEVELS}
											initial={getMetafieldValue(variant, 'book', 'reading_level')}
										/>
									</div>

									<div class="space-y-2">
										<Label for="illustrationsBy-{variant.id}">Illustrated By</Label>
										<Input
											id="illustrationsBy-{variant.id}"
											placeholder="Separera flera med komma"
											{...vf.illustrationsBy.as(
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
											{...vf.editedBy.as('text', getMetafieldList(variant, 'book', 'edited_by'))}
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
											{...vf.originalTitle.as(
												'text',
												getMetafieldValue(variant, 'translated_book', 'original_title')
											)}
										/>
									</div>

									<div class="space-y-2">
										<Label for="translatedBy-{variant.id}">Translated By</Label>
										<Input
											id="translatedBy-{variant.id}"
											{...vf.translatedBy.as(
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
											{...vf.narratedBy.as(
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
											{...vf.duration.as('text', getMetafieldValue(variant, 'audio_book', 'duration'))}
										/>
									</div>
								</div>
							</div>

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
											onclick={() => selectVariantImage(variant.id, null)}
											class="flex h-16 w-16 items-center justify-center rounded-md border p-1 text-center text-[10px] leading-tight text-muted-foreground {imageFor(
												variant
											) == null
												? 'ring-2 ring-primary'
												: ''}"
										>
											Product default
										</button>
										{#each data.media as image (image.id)}
											<button
												type="button"
												onclick={() => selectVariantImage(variant.id, image.id)}
												class="overflow-hidden rounded-md border {imageFor(variant) === image.id
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
						</div>
					{/each}

					<!-- Add-variant pane: only visible when the New tab is active. Its
					     controls are nameless (bound to local state) so they aren't part
					     of the tracked save; adding is a command, not a form submit. -->
					<div style:display={activeTab === NEW_TAB ? undefined : 'none'}>
						{#if soleVariantNeedsFormat}
							<div
								class="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground"
							>
								Välj format på den befintliga varianten innan du lägger till fler.
							</div>
						{:else if availableFormatsForNew.length === 0}
							<div
								class="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground"
							>
								Alla format är redan använda på den här produkten.
							</div>
						{:else}
							<p class="mb-3 text-sm text-muted-foreground">
								Välj formatet — variantens titel och metadatan "book.binding" sätts båda till det
								värdet. SKU/ISBN och övrig metadata kan redigeras efter att varianten är skapad.
							</p>
							<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
								<div class="flex-1 space-y-1.5">
									<Label for="new-variant-format">Format *</Label>
									<EnumSelect
										id="new-variant-format"
										bind:value={newFormat}
										options={availableFormatsForNew}
										placeholder="Välj format…"
									/>
								</div>
								<div class="space-y-1.5 sm:w-32">
									<Label for="new-variant-price">Price (SEK) *</Label>
									<Input
										id="new-variant-price"
										inputmode="decimal"
										placeholder="0"
										bind:value={newPrice}
									/>
								</div>
								<Button type="button" disabled={adding} onclick={addVariant}>
									<Plus class="mr-2 h-4 w-4" />
									{adding ? 'Adding…' : 'Add variant'}
								</Button>
							</div>
							{#if newVariantError}
								<p class="mt-2 text-sm text-destructive">{newVariantError}</p>
							{/if}
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</form>

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
