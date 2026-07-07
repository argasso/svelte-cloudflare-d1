<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Save from '@lucide/svelte/icons/save';
	import Trash from '@lucide/svelte/icons/trash';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { invalidateAll } from '$app/navigation';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import SyncStatusCard from '$lib/components/SyncStatusCard.svelte';
	import MediaManager from '$lib/components/MediaManager.svelte';
	import { createFormChanges } from '$lib/formChanges.svelte';
	import { deleteAuthor, updateAuthor } from '../authors.remote';

	let { data } = $props();
	let { author } = $derived(data);

	let fields = $derived(author.fields ?? {});

	// Isolated form state per author, so navigating between authors doesn't leak state
	let update = $derived(updateAuthor.for(String(author.id)));
	let remove = $derived(deleteAuthor.for(String(author.id)));

	const changes = createFormChanges();
	// Discarding unsaved edits: a reload is the only reliable reset (remote-form +
	// rich-text hold internal state) and it restores the last-saved values.
	function discard() {
		if (confirm('Ångra ändringar som inte sparats?')) location.reload();
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/authors">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">{author.title}</h1>
			<p class="text-muted-foreground">
				Author ID: {author.id}
				{#if data.syncEnabled && author.shopifyId}
					• Shopify ID: {author.shopifyId}
				{/if}
			</p>
		</div>
		<form {...remove} class="inline">
			<input type="hidden" name="id" value={author.id} />
			<Button type="submit" variant="destructive" disabled={!!remove.pending}>
				<Trash class="mr-2 h-4 w-4" />
				Delete
			</Button>
		</form>
		{#if changes.dirty}
			<Button type="button" variant="outline" onclick={discard}>
				<Undo2 class="mr-2 h-4 w-4" />
				Discard
			</Button>
		{/if}
		<Button type="submit" form="author-form" disabled={!!update.pending || !changes.dirty}>
			<Save class="mr-2 h-4 w-4" />
			Save Changes
		</Button>
	</div>

	<form
		id="author-form"
		use:changes.attach
		{...update.enhance(async ({ submit }) => {
			if (await submit()) {
				await invalidateAll();
				changes.markSaved();
			}
		})}
		class="grid gap-4 md:grid-cols-3"
	>
		<input type="hidden" name="id" value={author.id} />

		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Name *</Label>
						<Input id="title" {...update.fields.title.as('text', author.title ?? '')} />
						{#each update.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="handle">Handle</Label>
						<Input
							id="handle"
							placeholder="e.g., john-doe"
							{...update.fields.handle.as('text', author.handle)}
						/>
					</div>

					{#if fields.image}
						<div class="space-y-2">
							<Label>Image</Label>
							<p class="text-xs text-muted-foreground break-all">{fields.image}</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Bio</Card.Title>
				</Card.Header>
				<Card.Content>
					<RichTextEditor
						name="bio"
						value={fields.description}
						placeholder="Write the author's biography here..."
					/>
					{#each update.fields.bio.issues() ?? [] as issue (issue.message)}
						<p class="mt-2 text-sm text-destructive">{issue.message}</p>
					{/each}
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
						name="status"
						value={author.status}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="Active">Active</option>
						<option value="Draft">Draft</option>
						<option value="Archived">Archived</option>
					</select>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Metadata</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-sm space-y-2">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Created:</span>
							<span class="text-xs">
								{new Date(author.createdAt).toLocaleString('sv-SE')}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Last Updated:</span>
							<span class="text-xs">
								{new Date(author.updatedAt).toLocaleString('sv-SE')}
							</span>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			{#if data.syncEnabled}
				<SyncStatusCard
					entityType="metaobject"
					entityId={author.id}
					shopifyId={author.shopifyId}
					shopifyUpdatedAt={author.shopifyUpdatedAt}
					lastSyncedAt={author.lastSyncedAt}
					updatedAt={author.updatedAt}
				/>
			{/if}
		</div>
	</form>

	<div class="md:max-w-sm">
		<MediaManager
			entityType="metaobject"
			entityId={author.id}
			media={data.media}
			title="Author image"
			single
		/>
	</div>
</div>
