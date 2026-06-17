import { error } from '@sveltejs/kit';
import { and, eq, max } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import * as schema from '$lib/db/schema';

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif'
};

/**
 * Upload an image straight into R2 and attach it to an entity. R2-native from
 * the start (migratedToR2=true) — no Shopify involved. Pushing the new image to
 * Shopify is a separate sync-gateway concern handled via /admin/sync (so this
 * deliberately does NOT mark the entity dirty yet — see media push increment).
 */
export const uploadMedia = form(
	v.object({
		entityType: v.picklist(['product', 'variant', 'metaobject']),
		entityId: v.pipe(v.string(), v.minLength(1)),
		file: v.pipe(
			v.file('Choose an image'),
			v.mimeType(
				Object.keys(EXT_BY_MIME) as `${string}/${string}`[],
				'Must be a JPEG, PNG, WebP, GIF or AVIF image'
			),
			v.maxSize(10 * 1024 * 1024, 'Image must be 10 MB or smaller')
		)
	}),
	async ({ entityType, entityId, file }) => {
		const event = getRequestEvent();
		await requireAdmin(event);

		const bucket = event.platform?.env.MEDIA;
		if (!bucket) error(503, 'Media storage (R2 bucket MEDIA) is not available.');
		const db = event.locals.db;

		const ext = EXT_BY_MIME[file.type] ?? 'bin';
		const key = `${entityType}/${entityId}/${crypto.randomUUID()}.${ext}`;
		const buf = await file.arrayBuffer();

		await bucket.put(key, buf, { httpMetadata: { contentType: file.type } });

		// Append after any existing media for this entity.
		const [{ maxPos } = { maxPos: null }] = await db
			.select({ maxPos: max(schema.media.position) })
			.from(schema.media)
			.where(and(eq(schema.media.entityType, entityType), eq(schema.media.entityId, entityId)));

		await db.insert(schema.media).values({
			entityType,
			entityId,
			mediaType: 'image',
			r2Key: key,
			migratedToR2: true,
			mimeType: file.type,
			fileSize: buf.byteLength,
			position: (maxPos ?? -1) + 1
		});

		// Mark the product dirty so the new image pushes via /admin/sync. Only
		// products have a media push today — don't dirty metaobjects/variants yet,
		// or a sync would clear the flag without pushing their image.
		if (entityType === 'product') {
			await db
				.update(schema.product)
				.set({ updatedAt: new Date().toISOString() })
				.where(eq(schema.product.id, Number(entityId)));
		}

		return { success: true };
	}
);
