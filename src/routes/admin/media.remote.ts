import { error } from '@sveltejs/kit';
import { and, eq, max } from 'drizzle-orm';
import { command, form, getRequestEvent } from '$app/server';
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

		// Mark the entity dirty so the new image pushes via /admin/sync
		// (products and authors; variants have no media push).
		await markEntityDirty(db, entityType, entityId);

		return { success: true };
	}
);

/**
 * Assign one of the product's images to a variant (or clear it with mediaId
 * null → falls back to the product's default image). Marks the variant dirty so
 * the assignment pushes to Shopify via /admin/sync.
 */
export const setVariantImage = command(
	v.object({
		variantId: v.pipe(v.string(), v.minLength(1)),
		mediaId: v.nullable(v.pipe(v.number(), v.integer()))
	}),
	async ({ variantId, mediaId }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;

		// Guard: the image must be a product image on this variant's own product.
		if (mediaId !== null) {
			const variant = await db.query.variant.findFirst({
				where: eq(schema.variant.id, variantId),
				columns: { productId: true }
			});
			if (!variant) error(404, 'Variant not found');
			const image = await db.query.media.findFirst({
				where: and(eq(schema.media.id, mediaId), eq(schema.media.entityType, 'product')),
				columns: { entityId: true }
			});
			if (!image || image.entityId !== String(variant.productId)) {
				error(400, 'Image does not belong to this product');
			}
		}

		await db
			.update(schema.variant)
			.set({ imageId: mediaId, updatedAt: new Date().toISOString() })
			.where(eq(schema.variant.id, variantId));

		return { success: true };
	}
);

/**
 * Bump an entity's updatedAt so its media changes push via /admin/sync.
 * Products and authors (metaobjects) have a media push; variants don't.
 */
async function markEntityDirty(db: App.Locals['db'], entityType: string, entityId: string) {
	const now = new Date().toISOString();
	if (entityType === 'product') {
		await db.update(schema.product).set({ updatedAt: now }).where(eq(schema.product.id, Number(entityId)));
	} else if (entityType === 'metaobject') {
		await db
			.update(schema.metaobject)
			.set({ updatedAt: now })
			.where(eq(schema.metaobject.id, Number(entityId)));
	}
}

const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

/**
 * Delete an image: removes the R2 object and the media row, clears any variant
 * that pointed at it, and marks the product dirty. On the next sync the product
 * push reconciles Shopify (the now-missing gid is fileDelete'd).
 */
export const deleteMedia = command(
	v.object({ mediaId: v.pipe(v.number(), v.integer()) }),
	async ({ mediaId }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;

		const row = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) });
		if (!row) error(404, 'Media not found');

		const bucket = event.platform?.env.MEDIA;
		if (row.r2Key && bucket) await bucket.delete(row.r2Key);

		await db
			.update(schema.variant)
			.set({ imageId: null })
			.where(eq(schema.variant.imageId, mediaId));
		await db.delete(schema.media).where(eq(schema.media.id, mediaId));
		await markEntityDirty(db, row.entityType, row.entityId);

		return { success: true };
	}
);

/** Reorder an entity's images to the given order (by media id). Marks dirty. */
export const reorderMedia = command(
	v.object({
		entityType: v.picklist(['product', 'variant', 'metaobject']),
		entityId: v.pipe(v.string(), v.minLength(1)),
		orderedIds: v.array(v.pipe(v.number(), v.integer()))
	}),
	async ({ entityType, entityId, orderedIds }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;

		for (let i = 0; i < orderedIds.length; i++) {
			await db
				.update(schema.media)
				.set({ position: i })
				.where(
					and(
						eq(schema.media.id, orderedIds[i]),
						eq(schema.media.entityType, entityType),
						eq(schema.media.entityId, entityId)
					)
				);
		}
		await markEntityDirty(db, entityType, entityId);

		return { success: true };
	}
);

/**
 * Replace an image's bytes in place: writes a new R2 object (new key busts
 * caches), deletes the old one, and clears shopify_id so the push uploads it
 * fresh and reconcile deletes the old Shopify file. Variants pointing at it are
 * marked dirty so they re-associate to the new image.
 */
export const replaceMedia = form(
	v.object({
		mediaId: idField,
		file: v.pipe(
			v.file('Choose an image'),
			v.mimeType(
				Object.keys(EXT_BY_MIME) as `${string}/${string}`[],
				'Must be a JPEG, PNG, WebP, GIF or AVIF image'
			),
			v.maxSize(10 * 1024 * 1024, 'Image must be 10 MB or smaller')
		)
	}),
	async ({ mediaId, file }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;

		const row = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) });
		if (!row) error(404, 'Media not found');
		const bucket = event.platform?.env.MEDIA;
		if (!bucket) error(503, 'Media storage (R2 bucket MEDIA) is not available.');

		const ext = EXT_BY_MIME[file.type] ?? 'bin';
		const key = `${row.entityType}/${row.entityId}/${crypto.randomUUID()}.${ext}`;
		const buf = await file.arrayBuffer();
		await bucket.put(key, buf, { httpMetadata: { contentType: file.type } });
		if (row.r2Key) await bucket.delete(row.r2Key);

		await db
			.update(schema.media)
			.set({
				r2Key: key,
				shopifyId: null,
				mimeType: file.type,
				fileSize: buf.byteLength,
				migratedToR2: true,
				updatedAt: new Date().toISOString()
			})
			.where(eq(schema.media.id, mediaId));

		if (row.entityType === 'product') {
			await db
				.update(schema.variant)
				.set({ updatedAt: new Date().toISOString() })
				.where(eq(schema.variant.imageId, mediaId));
		}
		await markEntityDirty(db, row.entityType, row.entityId);

		return { success: true };
	}
);
