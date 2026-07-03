/**
 * Rebuild a product's derived metaobject links from its current metafields,
 * mirroring the import's linkProducts but for a single product (used by the
 * inbound webhook after it refreshes metafields). Authors come from the
 * product-level custom.authors metafield; categories from the union of each
 * variant's book.category. Returns the product's author gids for the managed
 * field hash. gids that don't resolve to a local metaobject are skipped.
 */
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';

function parseGidList(value: string | null | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
		if (typeof parsed === 'string') return [parsed];
	} catch {
		/* not JSON */
	}
	return [];
}

export async function rebuildProductLinks(db: DbClient, productId: number): Promise<string[]> {
	const product = await db.query.product.findFirst({
		where: eq(schema.product.id, productId),
		columns: { id: true, shopifyId: true }
	});
	if (!product) return [];

	const metaobjects = await db
		.select({ id: schema.metaobject.id, shopifyId: schema.metaobject.shopifyId })
		.from(schema.metaobject);
	const idByGid = new Map(metaobjects.map((m) => [m.shopifyId ?? '', m.id]));
	const gidById = new Map(metaobjects.map((m) => [m.id, m.shopifyId ?? '']));

	// Authors: product-level custom.authors (owner is the product gid).
	const productGid = `gid://shopify/Product/${product.shopifyId}`;
	const [authorMf] = await db
		.select({ value: schema.metafield.value })
		.from(schema.metafield)
		.where(
			and(
				eq(schema.metafield.namespace, 'custom'),
				eq(schema.metafield.key, 'authors'),
				eq(schema.metafield.ownerId, productGid)
			)
		)
		.limit(1);
	const authorIds = parseGidList(authorMf?.value)
		.map((g) => idByGid.get(g))
		.filter((x): x is number => x != null);

	// Categories: union of each variant's book.category metafield.
	const variants = await db
		.select({ id: schema.variant.id })
		.from(schema.variant)
		.where(eq(schema.variant.productId, productId));
	const variantIds = variants.map((v) => v.id);
	const catGids = new Set<string>();
	if (variantIds.length > 0) {
		const catMfs = await db
			.select({ value: schema.metafield.value })
			.from(schema.metafield)
			.where(
				and(
					eq(schema.metafield.namespace, 'book'),
					eq(schema.metafield.key, 'category'),
					inArray(schema.metafield.ownerId, variantIds)
				)
			);
		for (const m of catMfs) for (const g of parseGidList(m.value)) catGids.add(g);
	}
	const categoryIds = [...catGids].map((g) => idByGid.get(g)).filter((x): x is number => x != null);

	await db
		.delete(schema.productsToMetaobjects)
		.where(
			and(
				eq(schema.productsToMetaobjects.productId, productId),
				inArray(schema.productsToMetaobjects.relationType, ['author', 'category'])
			)
		);
	if (authorIds.length > 0) {
		await db.insert(schema.productsToMetaobjects).values(
			authorIds.map((metaobjectId, position) => ({
				productId,
				metaobjectId,
				relationType: 'author' as const,
				position
			}))
		);
	}
	if (categoryIds.length > 0) {
		await db.insert(schema.productsToMetaobjects).values(
			categoryIds.map((metaobjectId, position) => ({
				productId,
				metaobjectId,
				relationType: 'category' as const,
				position
			}))
		);
	}

	return authorIds.map((id) => gidById.get(id) ?? '').filter(Boolean);
}
