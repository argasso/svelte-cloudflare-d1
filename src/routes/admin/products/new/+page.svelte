<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import { createProduct } from '../products.remote';
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<Button variant="ghost" size="icon" href="/admin/products">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-bold sm:text-3xl">New product</h1>
				<p class="truncate text-sm text-muted-foreground">
					Fill in the basics — you can add variants, images and metadata after saving.
				</p>
			</div>
		</div>
		<div class="flex gap-2 self-end sm:self-auto">
			<Button type="submit" form="product-form" disabled={!!createProduct.pending}>
				<Plus class="mr-2 h-4 w-4" />
				Create product
			</Button>
		</div>
	</div>

	<form id="product-form" {...createProduct} class="grid gap-4 md:grid-cols-3">
		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input id="title" placeholder="e.g., Avhopparen" {...createProduct.fields.title.as('text')} />
						{#each createProduct.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="handle">Handle</Label>
						<Input
							id="handle"
							placeholder="e.g., avhopparen (auto-generated from title if empty)"
							{...createProduct.fields.handle.as('text')}
						/>
						<p class="text-xs text-muted-foreground">
							URL slug — used in <span class="font-mono">/bok/&lt;handle&gt;</span>. Lowercase, hyphens.
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Status</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						{...createProduct.fields.status.as('text', 'Draft')}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="Draft">Draft</option>
						<option value="Active">Active</option>
						<option value="Archived">Archived</option>
					</select>
					<p class="mt-2 text-xs text-muted-foreground">
						New products are drafts by default — they won't show on the storefront until Active.
					</p>
				</Card.Content>
			</Card.Root>
		</div>
	</form>
</div>
