<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Upload from '@lucide/svelte/icons/upload';
	import { invalidateAll } from '$app/navigation';
	import type { Media } from '$lib/db/schema';
	import { mediaImage } from '$lib/utils/image';
	import { uploadMedia } from '../../routes/admin/media.remote';

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
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if images.length > 0}
			<div class="grid grid-cols-3 gap-2">
				{#each images as image (image.id)}
					<div class="overflow-hidden rounded-md border bg-muted">
						<img
							src={mediaImage(image, 'thumb')}
							alt={image.altText ?? ''}
							class="aspect-square w-full object-cover"
							loading="lazy"
						/>
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
