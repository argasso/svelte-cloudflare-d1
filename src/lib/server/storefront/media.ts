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
