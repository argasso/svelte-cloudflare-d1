<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Save from '@lucide/svelte/icons/save';
	import Trash from '@lucide/svelte/icons/trash';
	import { invalidateAll } from '$app/navigation';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import SyncStatusCard from '$lib/components/SyncStatusCard.svelte';
	import { deletePage, updatePage } from '../pages.remote';

	let { data } = $props();
	let { page } = $derived(data);

	let fields = $derived(page.fields ?? {});

	// Isolated form state per page, so navigating between pages doesn't leak state
	let update = $derived(updatePage.for(String(page.id)));
	let remove = $derived(deletePage.for(String(page.id)));
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/pages">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">{page.title}</h1>
			<p class="text-muted-foreground">
				Page ID: {page.id}
				{#if data.syncEnabled && page.shopifyId}
					• Shopify ID: {page.shopifyId}
				{/if}
				{#if data.productCount}
					• {data.productCount} linked products
				{/if}
			</p>
		</div>
		<form {...remove} class="inline">
			<input type="hidden" name="id" value={page.id} />
			<Button type="submit" variant="destructive" disabled={!!remove.pending}>
				<Trash class="mr-2 h-4 w-4" />
				Delete
			</Button>
		</form>
		<Button type="submit" form="page-form" disabled={!!update.pending}>
			<Save class="mr-2 h-4 w-4" />
			Save Changes
		</Button>
	</div>

	{#each remove.fields.id.issues() ?? [] as issue (issue.message)}
		<p class="text-sm text-destructive text-right">{issue.message}</p>
	{/each}

	<form
		id="page-form"
		{...update.enhance(async ({ submit }) => {
			if (await submit()) {
				await invalidateAll();
			}
		})}
		class="grid gap-4 md:grid-cols-3"
	>
		<input type="hidden" name="id" value={page.id} />

		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input id="title" {...update.fields.title.as('text', page.title ?? '')} />
						{#each update.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="name">Menu name</Label>
						<Input
							id="name"
							placeholder="Shorter name shown in menus (optional)"
							{...update.fields.name.as('text', fields.name ?? '')}
						/>
					</div>

					<div class="space-y-2">
						<Label for="handle">Handle</Label>
						<Input id="handle" {...update.fields.handle.as('text', page.handle)} />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Content</Card.Title>
				</Card.Header>
				<Card.Content>
					<RichTextEditor name="content" value={fields.content} placeholder="Page content..." />
					{#each update.fields.content.issues() ?? [] as issue (issue.message)}
						<p class="mt-2 text-sm text-destructive">{issue.message}</p>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>SEO</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="metaTitleSeo">Meta title</Label>
						<Input
							id="metaTitleSeo"
							{...update.fields.metaTitleSeo.as('text', fields.meta_title_seo ?? '')}
						/>
					</div>
					<div class="space-y-2">
						<Label for="metaDescriptionSeo">Meta description</Label>
						<Input
							id="metaDescriptionSeo"
							{...update.fields.metaDescriptionSeo.as('text', fields.meta_description_seo ?? '')}
						/>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Parent Page</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						name="parentId"
						value={page.parentId != null ? String(page.parentId) : ''}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">— None (top level) —</option>
						{#each data.parentOptions as option (option.id)}
							<option value={String(option.id)}>{option.title}</option>
						{/each}
					</select>
					{#each update.fields.parentId.issues() ?? [] as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Status</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						name="status"
						value={page.status}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="Active">Active</option>
						<option value="Draft">Draft</option>
						<option value="Archived">Archived</option>
					</select>
				</Card.Content>
			</Card.Root>

			{#if data.children.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Sub-pages ({data.children.length})</Card.Title>
					</Card.Header>
					<Card.Content>
						<ul class="space-y-1">
							{#each data.children as child (child.id)}
								<li class="flex items-center justify-between text-sm">
									<a href="/admin/pages/{child.id}" class="hover:underline">{child.title}</a>
									<span class="text-xs text-muted-foreground">{child.status}</span>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header>
					<Card.Title>Metadata</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-sm space-y-2">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Created:</span>
							<span class="text-xs">
								{new Date(page.createdAt).toLocaleString('sv-SE')}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Last Updated:</span>
							<span class="text-xs">
								{new Date(page.updatedAt).toLocaleString('sv-SE')}
							</span>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			{#if data.syncEnabled}
				<SyncStatusCard
					shopifyId={page.shopifyId}
					shopifyUpdatedAt={page.shopifyUpdatedAt}
					lastSyncedAt={page.lastSyncedAt}
					updatedAt={page.updatedAt}
				/>
			{/if}
		</div>
	</form>
</div>
