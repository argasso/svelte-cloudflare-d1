<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Save from '@lucide/svelte/icons/save';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { invalidateAll } from '$app/navigation';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import type { Metafield, Variant } from '$lib/db/schema';
	import SyncStatusCard from '$lib/components/SyncStatusCard.svelte';
	import MediaManager from '$lib/components/MediaManager.svelte';
	import { updateProduct, updateVariant } from '../products.remote';

	let { data } = $props();
	let { product } = $derived(data);

	let expandedVariants = $state<Set<string>>(new Set([data.product.variants[0]?.id]));

	// Isolated form state per product, so navigating between products doesn't leak state
	let update = $derived(updateProduct.for(String(product.id)));

	function getMetafieldValue(
		variant: Variant & { metafields: Metafield[] },
		namespace: string,
		key: string
	): string {
		const mf = variant.metafields?.find((m) => m.namespace === namespace && m.key === key);
		return mf?.value || '';
	}

	function isLinked(metaobjectId: number, linked: typeof data.categories) {
		return linked.some((l) => l.metaobject.id === metaobjectId);
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
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/products">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">{product.title}</h1>
			<p class="text-muted-foreground">
				Product ID: {product.id}
				{#if data.syncEnabled && product.shopifyId}
					• Shopify ID: {product.shopifyId}
				{/if}
			</p>
		</div>
		<Button type="submit" form="product-form" disabled={!!update.pending}>
			<Save class="mr-2 h-4 w-4" />
			Save Changes
		</Button>
	</div>

	<!--
		The product form element is empty; its inputs are associated via the
		form="product-form" attribute. This keeps variant forms as siblings
		instead of (invalid) nested forms.
	-->
	<form
		id="product-form"
		{...update.enhance(async ({ submit }) => {
			if (await submit()) {
				await invalidateAll();
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

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="isbn">ISBN</Label>
							<Input
								id="isbn"
								form="product-form"
								{...update.fields.isbn.as('text', product.isbn ?? '')}
							/>
						</div>

						<div class="space-y-2">
							<Label for="sku">SKU</Label>
							<Input
								id="sku"
								form="product-form"
								{...update.fields.sku.as('text', product.sku ?? '')}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="price">Price (SEK)</Label>
						<Input
							id="price"
							form="product-form"
							inputmode="decimal"
							{...update.fields.price.as('text', product.price != null ? String(product.price) : '')}
						/>
						{#each update.fields.price.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Variants -->
			{#each product.variants as variant (variant.id)}
				{@const variantForm = updateVariant.for(variant.id)}
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
							<Button
								type="submit"
								form="variant-form-{variant.id}"
								size="sm"
								disabled={!!variantForm.pending}
							>
								<Save class="mr-2 h-4 w-4" />
								Save
							</Button>
						</div>
					</Card.Header>

					{#if expandedVariants.has(variant.id)}
						<Card.Content>
							<form
								id="variant-form-{variant.id}"
								{...variantForm.enhance(async ({ submit }) => {
									if (await submit()) {
										await invalidateAll();
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
											<Label for="sku-{variant.id}">SKU / ISBN</Label>
											<Input
												id="sku-{variant.id}"
												{...variantForm.fields.sku.as('text', variant.sku ?? '')}
											/>
										</div>
									</div>
								</div>

								<div class="space-y-4">
									<h3 class="text-lg font-semibold">Book Details</h3>
									<div class="grid gap-4 md:grid-cols-2">
										<div class="space-y-2">
											<Label for="binding-{variant.id}">Binding</Label>
											<Input
												id="binding-{variant.id}"
												placeholder="e.g., Inbunden, Pocket, Danskt band"
												{...variantForm.fields.binding.as(
													'text',
													getMetafieldValue(variant, 'book', 'binding')
												)}
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
											<Input
												id="age-{variant.id}"
												placeholder="e.g., 9+"
												{...variantForm.fields.age.as(
													'text',
													getMetafieldValue(variant, 'book', 'age')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="publishMonth-{variant.id}">Publish Month</Label>
											<Input
												id="publishMonth-{variant.id}"
												placeholder="e.g., januari 2026"
												{...variantForm.fields.publishMonth.as(
													'text',
													getMetafieldValue(variant, 'book', 'publish_month')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="readingLevel-{variant.id}">Reading Level</Label>
											<Input
												id="readingLevel-{variant.id}"
												placeholder="e.g., Lättläst"
												{...variantForm.fields.readingLevel.as(
													'text',
													getMetafieldValue(variant, 'book', 'reading_level')
												)}
											/>
										</div>

										<div class="space-y-2">
											<Label for="illustrationsBy-{variant.id}">Illustrated By</Label>
											<Input
												id="illustrationsBy-{variant.id}"
												{...variantForm.fields.illustrationsBy.as(
													'text',
													getMetafieldValue(variant, 'book', 'illustrations_by')
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
							</form>
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

			<Card.Root>
				<Card.Header>
					<Card.Title>Categories</Card.Title>
					<Card.Description>Assign to multiple categories</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-3 max-h-96 overflow-y-auto">
						{#each data.allCategories as category (category.id)}
							<div class="flex items-center space-x-2">
								<input
									type="checkbox"
									id="cat-{category.id}"
									name="categories[]"
									form="product-form"
									value={String(category.id)}
									checked={isLinked(category.id, data.categories)}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<Label for="cat-{category.id}" class="text-sm font-normal cursor-pointer">
									{category.title}
									<span class="text-muted-foreground text-xs">({category.handle})</span>
								</Label>
							</div>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Authors</Card.Title>
					<Card.Description>Assign one or more authors</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.allAuthors.length > 0}
						<div class="space-y-3 max-h-96 overflow-y-auto">
							{#each data.allAuthors as author (author.id)}
								<div class="flex items-center space-x-2">
									<input
										type="checkbox"
										id="author-{author.id}"
										name="authors[]"
										form="product-form"
										value={String(author.id)}
										checked={isLinked(author.id, data.authors)}
										class="h-4 w-4 rounded border-gray-300"
									/>
									<Label for="author-{author.id}" class="text-sm font-normal cursor-pointer">
										{author.title}
										<span class="text-muted-foreground text-xs">({author.handle})</span>
									</Label>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No authors found</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<MediaManager entityType="product" entityId={product.id} media={data.media} />

			{#if data.syncEnabled}
				<SyncStatusCard
					shopifyId={product.shopifyId}
					shopifyUpdatedAt={product.shopifyUpdatedAt}
					lastSyncedAt={product.lastSyncedAt}
					updatedAt={product.updatedAt}
				/>
			{/if}
		</div>
	</div>
</div>
