import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import type { Media } from '$lib/db/schema';

/** The media fields the storefront needs to render an image (see mediaImage). */
export type Cover = Pick<Media, 'r2Key' | 'migratedToR2' | 'shopifyUrl' | 'altText'>;

/**
 * Attach each product's cover image (its lowest-position product media row) so
 * the listing pages can render real covers. One query for the whole batch.
 */
export async function attachCovers<T extends { id: number }>(
	db: DbClient,
	products: T[]
): Promise<(T & { cover: Cover | null })[]> {
	if (products.length === 0) return [];

	const ids = products.map((p) => String(p.id));
	const rows = await db
		.select({
			entityId: schema.media.entityId,
			r2Key: schema.media.r2Key,
			migratedToR2: schema.media.migratedToR2,
			shopifyUrl: schema.media.shopifyUrl,
			altText: schema.media.altText
		})
		.from(schema.media)
		.where(and(eq(schema.media.entityType, 'product'), inArray(schema.media.entityId, ids)))
		.orderBy(schema.media.position);

	// rows are position-ascending; keep the first seen per product = the cover.
	const coverByProduct = new Map<string, Cover>();
	for (const r of rows) {
		if (!coverByProduct.has(r.entityId)) {
			coverByProduct.set(r.entityId, r);
		}
	}

	return products.map((p) => ({ ...p, cover: coverByProduct.get(String(p.id)) ?? null }));
}
