<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Save from '@lucide/svelte/icons/save';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { data } = $props();
	let { categories } = $derived(data);
	$inspect(categories)
	let selectedCategories = $state(
		data.categories?.map((c: any) => c.metaobject.id.toString()) || []
	);
	let selectedAuthors = $state(data.authors?.map((a: any) => a.metaobject.id.toString()) || []);
	let expandedVariants = $state<Set<string>>(new Set([data.product.variants[0]?.id]));

	// Helper to get metafield value
	function getMetafieldValue(variant: any, namespace: string, key: string): string {
		const mf = variant.metafields?.find(
			(m: any) => m.namespace === namespace && m.key === key
		);
		return mf?.value || '';
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
			<h1 class="text-3xl font-bold">{data.product.title}</h1>
			<p class="text-muted-foreground">
				Product ID: {data.product.id}
				{#if data.product.shopifyId}
					• Shopify ID: {data.product.shopifyId}
				{/if}
			</p>
		</div>
		<Button type="submit" form="product-form">
			<Save class="mr-2 h-4 w-4" />
			Save Changes
		</Button>
	</div>

	<form id="product-form" method="POST" action="?/update">
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
							<Input id="title" name="title" value={data.product.title} required />
						</div>

						<div class="space-y-2">
							<Label for="description">Description</Label>
							<textarea
								id="description"
								name="description"
								value={data.product.description || ''}
								rows={6}
								class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							></textarea>
						</div>

						<div class="grid gap-4 md:grid-cols-2">
							<div class="space-y-2">
								<Label for="isbn">ISBN</Label>
								<Input id="isbn" name="isbn" value={data.product.isbn || ''} />
							</div>

							<div class="space-y-2">
								<Label for="sku">SKU</Label>
								<Input id="sku" name="sku" value={data.product.sku || ''} />
							</div>
						</div>

						<div class="space-y-2">
							<Label for="price">Price (SEK)</Label>
							<Input
								id="price"
								name="price"
								type="number"
								step="0.01"
								value={data.product.price || ''}
							/>
						</div>
					</Card.Content>
				</Card.Root>

				<!-- Variants Section -->
				{#if data.product.variants.length > 0}
					{#each data.product.variants as variant}
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
									<Button type="submit" form="variant-form-{variant.id}" size="sm">
										<Save class="mr-2 h-4 w-4" />
										Save
									</Button>
								</div>
							</Card.Header>

							{#if expandedVariants.has(variant.id)}
								<Card.Content>
									<form
										id="variant-form-{variant.id}"
										method="POST"
										action="?/updateVariant"
										class="space-y-6"
									>
										<input type="hidden" name="variantId" value={variant.id} />

										<!-- Basic Variant Info -->
										<div class="space-y-4">
											<h3 class="text-lg font-semibold">Basic Information</h3>
											<div class="grid gap-4 md:grid-cols-2">
												<div class="space-y-2">
													<Label for="price-{variant.id}">Price (SEK) *</Label>
													<Input
														id="price-{variant.id}"
														name="price"
														type="number"
														step="0.01"
														value={variant.price}
														required
													/>
												</div>

												<div class="space-y-2">
													<Label for="sku-{variant.id}">SKU / ISBN *</Label>
													<Input
														id="sku-{variant.id}"
														name="sku"
														value={variant.sku || ''}
														required
													/>
												</div>
											</div>
										</div>

										<!-- Book Metafields -->
										<div class="space-y-4">
											<h3 class="text-lg font-semibold">Book Details</h3>
											<div class="grid gap-4 md:grid-cols-2">
												<div class="space-y-2">
													<Label for="binding-{variant.id}">Binding</Label>
													<Input
														id="binding-{variant.id}"
														name="binding"
														value={getMetafieldValue(variant, 'book', 'binding')}
														placeholder="e.g., Inbunden, Pocket, Danskt band"
													/>
												</div>

												<div class="space-y-2">
													<Label for="numberOfPages-{variant.id}">Number of Pages</Label>
													<Input
														id="numberOfPages-{variant.id}"
														name="numberOfPages"
														type="number"
														value={getMetafieldValue(variant, 'book', 'number_of_pages')}
													/>
												</div>

												<div class="space-y-2">
													<Label for="age-{variant.id}">Age</Label>
													<Input
														id="age-{variant.id}"
														name="age"
														value={getMetafieldValue(variant, 'book', 'age')}
														placeholder="e.g., 9+"
													/>
												</div>

												<div class="space-y-2">
													<Label for="publishMonth-{variant.id}">Publish Month</Label>
													<Input
														id="publishMonth-{variant.id}"
														name="publishMonth"
														value={getMetafieldValue(variant, 'book', 'publish_month')}
														placeholder="e.g., januari 2026"
													/>
												</div>

												<div class="space-y-2">
													<Label for="readingLevel-{variant.id}">Reading Level</Label>
													<Input
														id="readingLevel-{variant.id}"
														name="readingLevel"
														value={getMetafieldValue(variant, 'book', 'reading_level')}
														placeholder="e.g., Lättläst"
													/>
												</div>

												<div class="space-y-2">
													<Label for="illustrationsBy-{variant.id}">Illustrated By</Label>
													<Input
														id="illustrationsBy-{variant.id}"
														name="illustrationsBy"
														value={getMetafieldValue(variant, 'book', 'illustrations_by')}
													/>
												</div>
											</div>
										</div>

										<!-- Translated Book Metafields -->
										<div class="space-y-4">
											<h3 class="text-lg font-semibold">Translation Details (if applicable)</h3>
											<div class="grid gap-4 md:grid-cols-2">
												<div class="space-y-2">
													<Label for="originalTitle-{variant.id}">Original Title</Label>
													<Input
														id="originalTitle-{variant.id}"
														name="originalTitle"
														value={getMetafieldValue(variant, 'translated_book', 'original_title')}
													/>
												</div>

												<div class="space-y-2">
													<Label for="translatedBy-{variant.id}">Translated By</Label>
													<Input
														id="translatedBy-{variant.id}"
														name="translatedBy"
														value={getMetafieldValue(variant, 'translated_book', 'translated_by')}
													/>
												</div>
											</div>
										</div>
									</form>
								</Card.Content>
							{/if}
						</Card.Root>
					{/each}
				{:else}
					<Card.Root>
						<Card.Header>
							<Card.Title>Variants</Card.Title>
						</Card.Header>
						<Card.Content>
							<p class="text-sm text-muted-foreground mb-4">No variants yet</p>
							<Button variant="outline">
								<Plus class="mr-2 h-4 w-4" />
								Add Variant
							</Button>
						</Card.Content>
					</Card.Root>
				{/if}
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
							value={data.product.status}
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
							{#each data.allCategories as category}
								<div class="flex items-center space-x-2">
									<input
										type="checkbox"
										id="cat-{category.id}"
										name="categories"
										value={category.id.toString()}
										checked={selectedCategories.includes(category.id.toString())}
										onchange={(e) => {
											const target = e.currentTarget as HTMLInputElement;
											if (target.checked) {
												selectedCategories = [...selectedCategories, category.id.toString()];
											} else {
												selectedCategories = selectedCategories.filter(
													(id: string) => id !== category.id.toString()
												);
											}
										}}
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
						{#if data.allAuthors && data.allAuthors.length > 0}
							<div class="space-y-3 max-h-96 overflow-y-auto">
								{#each data.allAuthors as author}
									<div class="flex items-center space-x-2">
										<input
											type="checkbox"
											id="author-{author.id}"
											name="authors"
											value={author.id.toString()}
											checked={selectedAuthors.includes(author.id.toString())}
											onchange={(e) => {
												const target = e.currentTarget as HTMLInputElement;
												if (target.checked) {
													selectedAuthors = [...selectedAuthors, author.id.toString()];
												} else {
													selectedAuthors = selectedAuthors.filter(
														(id: string) => id !== author.id.toString()
													);
												}
											}}
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

				<Card.Root>
					<Card.Header>
						<Card.Title>Sync Status</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="text-sm space-y-2">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Shopify ID:</span>
								<span class="font-mono text-xs">{data.product.shopifyId || 'N/A'}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Last Updated:</span>
								<span class="text-xs">
									{new Date(data.product.updatedAt).toLocaleString('sv-SE')}
								</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Authors</Card.Title>
						<Card.Description>Assign one or more authors</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if data.allAuthors && data.allAuthors.length > 0}
							<div class="space-y-3 max-h-96 overflow-y-auto">
								{#each data.allAuthors as author}
									<div class="flex items-center space-x-2">
										<input
											type="checkbox"
											id="author-{author.id}"
											name="authors"
											value={author.id.toString()}
											checked={selectedAuthors.includes(author.id.toString())}
											onchange={(e) => {
												const target = e.currentTarget as HTMLInputElement;
												if (target.checked) {
													selectedAuthors = [...selectedAuthors, author.id.toString()];
												} else {
													selectedAuthors = selectedAuthors.filter(
														(id: string) => id !== author.id.toString()
													);
												}
											}}
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

				<Card.Root>
					<Card.Header>
						<Card.Title>Sync Status</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="text-sm space-y-2">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Shopify ID:</span>
								<span class="font-mono text-xs">{data.product.shopifyId || 'N/A'}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Last Updated:</span>
								<span class="text-xs">
									{new Date(data.product.updatedAt).toLocaleString('sv-SE')}
								</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</form>
</div>
