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
	const mediaRows = await db
		.select({
			entityId: schema.media.entityId,
			r2Key: schema.media.r2Key,
			migratedToR2: schema.media.migratedToR2,
			shopifyUrl: schema.media.shopifyUrl,
			altText: schema.media.altText
		})
		.from(schema.media)
		.where(and(eq(schema.media.entityType, entityType), inArray(schema.media.entityId, ids)))
		.orderBy(schema.media.position);

	// position-ascending; keep the first seen per entity = the cover.
	const coverByEntity = new Map<string, Cover>();
	for (const m of mediaRows) {
		if (!coverByEntity.has(m.entityId)) {
			coverByEntity.set(m.entityId, m);
		}
	}

	return rows.map((p) => ({ ...p, cover: coverByEntity.get(String(p.id)) ?? null }));
}
