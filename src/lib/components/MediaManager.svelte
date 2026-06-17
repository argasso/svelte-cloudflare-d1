<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Upload from '@lucide/svelte/icons/upload';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { invalidateAll } from '$app/navigation';
	import type { Media } from '$lib/db/schema';
	import { mediaImage } from '$lib/utils/image';
	import {
		uploadMedia,
		deleteMedia,
		reorderMedia,
		replaceMedia
	} from '../../routes/admin/media.remote';

	interface Props {
		entityType: 'product' | 'variant' | 'metaobject';
		entityId: number | string;
		media: Media[];
		title?: string;
	}

	let { entityType, entityId, media, title = 'Images' }: Props = $props();

	// Isolate form state per entity so navigating between records doesn't leak it.
	const upload = $derived(uploadMedia.for(`${entityType}:${entityId}`));

	const images = $derived([...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));

	async function move(id: number, delta: number) {
		const ids = images.map((im) => im.id);
		const i = ids.indexOf(id);
		const j = i + delta;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		await reorderMedia({ entityType, entityId: String(entityId), orderedIds: ids });
		await invalidateAll();
	}

	async function remove(id: number) {
		if (!confirm('Delete this image? It will also be removed from Shopify on the next sync.')) return;
		await deleteMedia({ mediaId: id });
		await invalidateAll();
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if images.length > 0}
			<div class="grid grid-cols-3 gap-3">
				{#each images as image, i (image.id)}
					<div class="space-y-1">
						<div class="overflow-hidden rounded-md border bg-muted">
							<img
								src={mediaImage(image, 'thumb')}
								alt={image.altText ?? ''}
								class="aspect-square w-full object-cover"
								loading="lazy"
							/>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex gap-0.5">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-7 w-7"
									disabled={i === 0}
									onclick={() => move(image.id, -1)}
									aria-label="Move left"
								>
									<ChevronLeft class="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-7 w-7"
									disabled={i === images.length - 1}
									onclick={() => move(image.id, 1)}
									aria-label="Move right"
								>
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
							<div class="flex gap-0.5">
								<form {...replaceMedia.for(image.id).enhance(async ({ submit, element }) => {
									if (await submit()) {
										element.reset();
										await invalidateAll();
									}
								})}>
									<input type="hidden" name="mediaId" value={image.id} />
									<label
										class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
										title="Replace image"
									>
										<RefreshCw class="h-4 w-4" />
										<input
											type="file"
											name="file"
											accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
											class="hidden"
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										/>
									</label>
								</form>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-7 w-7 text-destructive hover:text-destructive"
									onclick={() => remove(image.id)}
									aria-label="Delete image"
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No images yet.</p>
		{/if}

		<form
			{...upload.enhance(async ({ submit, element }) => {
				if (await submit()) {
					element.reset();
					await invalidateAll();
				}
			})}
			class="space-y-2"
		>
			<input type="hidden" name="entityType" value={entityType} />
			<input type="hidden" name="entityId" value={entityId} />
			<input
				type="file"
				name="file"
				accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
				class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
			/>
			{#each upload.fields.file.issues() ?? [] as issue (issue.message)}
				<p class="text-sm text-destructive">{issue.message}</p>
			{/each}
			<Button type="submit" size="sm" variant="outline" disabled={!!upload.pending}>
				<Upload class="mr-2 h-4 w-4" />
				{upload.pending ? 'Uploading…' : 'Upload image'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
