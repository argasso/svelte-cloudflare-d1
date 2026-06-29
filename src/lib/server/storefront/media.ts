import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import type { Media } from '$lib/db/schema';

/** The media fields the storefront needs to render an image (see mediaImage). */
export type Cover = Pick<Media, 'r2Key' | 'migratedToR2' | 'shopifyUrl' | 'altText'>;

/**
 * Attach each row's cover image (its lowest-position media row) so listing
 * pages can render real images. One query for the whole batch. Works for any
 * media entity type — products (default) or metaobjects (e.g. author portraits).
 */
export async function attachCovers<T extends { id: number }>(
	db: DbClient,
	rows: T[],
	entityType: 'product' | 'metaobject' = 'product'
): Promise<(T & { cover: Cover | null })[]> {
	if (rows.length === 0) return [];

	const ids = rows.map((p) => String(p.id));

	// position-ascending; keep the first seen per entity = the cover. Chunk the
	// id list so the IN(...) bound-parameter count stays under D1's 100/statement
	// cap (a listing of 100 products would otherwise blow it and 500).
	const coverByEntity = new Map<string, Cover>();
	const CHUNK = 90;
	for (let i = 0; i < ids.length; i += CHUNK) {
		const mediaRows = await db
			.select({
				entityId: schema.media.entityId,
				r2Key: schema.media.r2Key,
				migratedToR2: schema.media.migratedToR2,
				shopifyUrl: schema.media.shopifyUrl,
				altText: schema.media.altText
			})
			.from(schema.media)
			.where(
				and(
					eq(schema.media.entityType, entityType),
					inArray(schema.media.entityId, ids.slice(i, i + CHUNK))
				)
			)
			.orderBy(schema.media.position);

		for (const m of mediaRows) {
			if (!coverByEntity.has(m.entityId)) {
				coverByEntity.set(m.entityId, m);
			}
		}
	}

	return rows.map((p) => ({ ...p, cover: coverByEntity.get(String(p.id)) ?? null }));
}

/**
 * Attach a display price to each product from its variants (price lives on
 * variants, not the product). `price` is the lowest variant price; `priceFrom`
 * is true when variants differ, so the card can show "Från X kr". One batched
 * query, chunked under D1's bound-parameter cap like attachCovers.
 */
export async function attachPrices<T extends { id: number }>(
	db: DbClient,
	rows: T[]
): Promise<(T & { price: number | null; priceFrom: boolean })[]> {
	if (rows.length === 0) return [];

	const ids = rows.map((p) => p.id);
	const pricesByProduct = new Map<number, number[]>();
	const CHUNK = 90;
	for (let i = 0; i < ids.length; i += CHUNK) {
		const variantRows = await db
			.select({ productId: schema.variant.productId, price: schema.variant.price })
			.from(schema.variant)
			.where(inArray(schema.variant.productId, ids.slice(i, i + CHUNK)));
		for (const v of variantRows) {
			const list = pricesByProduct.get(v.productId) ?? [];
			list.push(v.price);
			pricesByProduct.set(v.productId, list);
		}
	}

	return rows.map((p) => {
		const prices = pricesByProduct.get(p.id) ?? [];
		if (prices.length === 0) return { ...p, price: null, priceFrom: false };
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return { ...p, price: min, priceFrom: min !== max };
	});
}

/**
 * Attach a product card cover, preferring the FIRST variant's assigned image
 * (variant.imageId → media row). A product card can match many variants; we
 * deterministically pick the first variant by id and use its image, matching
 * what the cart and detail page show. Falls back to the product's own cover
 * (lowest-position media, via attachCovers) when the first variant has no
 * image. One extra query for variants + one for their media.
 */
export async function attachProductCovers<T extends { id: number }>(
	db: DbClient,
	rows: T[]
): Promise<(T & { cover: Cover | null })[]> {
	const withProductCover = await attachCovers(db, rows);
	if (rows.length === 0) return withProductCover;

	const ids = rows.map((p) => p.id);
	const CHUNK = 90;

	// First variant (by id) per product and the media id it points at, if any.
	const seen = new Set<number>();
	const imageIdByProduct = new Map<number, number>();
	for (let i = 0; i < ids.length; i += CHUNK) {
		const variantRows = await db
			.select({ productId: schema.variant.productId, imageId: schema.variant.imageId })
			.from(schema.variant)
			.where(inArray(schema.variant.productId, ids.slice(i, i + CHUNK)))
			.orderBy(schema.variant.productId, schema.variant.id);
		for (const v of variantRows) {
			if (seen.has(v.productId)) continue;
			seen.add(v.productId);
			if (v.imageId != null) imageIdByProduct.set(v.productId, v.imageId);
		}
	}

	// Resolve those variant images to cover fields.
	const mediaIds = [...new Set(imageIdByProduct.values())];
	const coverByMediaId = new Map<number, Cover>();
	for (let i = 0; i < mediaIds.length; i += CHUNK) {
		const mediaRows = await db
			.select({
				id: schema.media.id,
				r2Key: schema.media.r2Key,
				migratedToR2: schema.media.migratedToR2,
				shopifyUrl: schema.media.shopifyUrl,
				altText: schema.media.altText
			})
			.from(schema.media)
			.where(inArray(schema.media.id, mediaIds.slice(i, i + CHUNK)));
		for (const m of mediaRows) coverByMediaId.set(m.id, m);
	}

	return withProductCover.map((p) => {
		const imageId = imageIdByProduct.get(p.id);
		const variantCover = imageId != null ? (coverByMediaId.get(imageId) ?? null) : null;
		return { ...p, cover: variantCover ?? p.cover };
	});
}
