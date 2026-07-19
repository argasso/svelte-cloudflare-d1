/**
 * Shopify -> D1 import, runnable inside a request (admin "Import" button) or the
 * CLI. Operates on a DbClient with chunked multi-row upserts so it stays within
 * SQLite's bound-parameter limit while minimizing D1 round-trips.
 *
 * Order matters: import metaobjects (authors, pages) first, then products
 * (so product->metaobject links can resolve), then link them.
 *
 * Safety: rows with unpushed local edits (dirty) are skipped, so a re-import
 * never clobbers a pending change. On a fresh/empty DB everything imports.
 */
import { gql, type Client } from '@urql/core';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { slugify } from '$lib/utils/slugify';
import { isDirty } from '$lib/server/sync/conflict';
import {
	gidList,
	hashFields,
	metaobjectManagedFields,
	productManagedFields,
	variantManagedFields
} from '$lib/server/sync/fields';

const PRODUCTS_PER_PAGE = 50;
/** Statements per batch round-trip. Each statement is a single-row upsert, so
 *  bound params stay well under D1's 100-per-statement limit; batching keeps
 *  round-trips low. */
const BATCH = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function extractNumericId(gid: string): string {
	return gid.split('/').pop() ?? gid;
}

/** Upsert rows as single-row statements, batched (one round-trip per BATCH). */
async function chunkedUpsert<T extends Record<string, unknown>>(
	db: DbClient,
	table:
		| typeof schema.product
		| typeof schema.variant
		| typeof schema.metafield
		| typeof schema.metaobject
		| typeof schema.media,
	rows: T[],
	conflictColumn: { name: string } | { name: string }[],
	updateColumns: string[]
) {
	if (rows.length === 0) return;
	const cols = table as unknown as Record<string, { name: string }>;
	const set = Object.fromEntries(
		updateColumns.map((c) => [c, sql.raw(`excluded."${cols[c].name}"`)])
	);
	const tableCols = table as unknown as Record<string, unknown>;
	const target = Array.isArray(conflictColumn)
		? conflictColumn.map((c) => tableCols[c.name])
		: tableCols[conflictColumn.name];
	const stmts = rows.map((row) =>
		db
			.insert(table)
			.values(row as AnyDb)
			.onConflictDoUpdate({ target: target as AnyDb, set })
	);
	for (let i = 0; i < stmts.length; i += BATCH) {
		await (db as AnyDb).batch(stmts.slice(i, i + BATCH));
	}
}

// --- Shopify queries (Admin API; results typed locally) ---

const PRODUCTS = gql`
	query ImportProducts($first: Int!, $after: String) {
		products(first: $first, after: $after) {
			edges {
				node {
					id
					handle
					title
					description
					descriptionHtml
					status
					seo { title description }
					createdAt
					updatedAt
					variants(first: 25) {
						edges {
							node {
								id
								title
								sku
								barcode
								price
								compareAtPrice
								inventoryQuantity
								inventoryItem { id }
								media(first: 1) {
									nodes { ... on MediaImage { id } }
								}
								metafields(first: 20) {
									edges { node { id namespace key value type } }
								}
							}
						}
					}
					metafields(first: 30) {
						edges { node { id namespace key value type } }
					}
					media(first: 15) {
						nodes { ... on MediaImage { id alt image { url width height } } }
					}
				}
			}
			pageInfo { hasNextPage endCursor }
		}
	}
`;

const METAOBJECTS = gql`
	query ImportMetaobjects($type: String!, $first: Int!, $after: String) {
		metaobjects(type: $type, first: $first, after: $after) {
			edges {
				node {
					id
					handle
					type
					updatedAt
					capabilities { publishable { status } }
					fields {
						key
						value
						reference {
							... on Metaobject { id }
							... on MediaImage { id alt image { url width height } }
						}
						references(first: 25) { nodes { ... on Metaobject { id } } }
					}
				}
			}
			pageInfo { hasNextPage endCursor }
		}
	}
`;

interface MetafieldNode { id: string; namespace: string; key: string; value: string | null; type: string }
/** A media node from a connection; non-image media lack these fields */
interface MediaImageNode {
	id?: string;
	alt?: string | null;
	image?: { url: string; width: number | null; height: number | null } | null;
}
interface VariantNode {
	id: string;
	title: string;
	sku: string | null;
	barcode: string | null;
	price: string;
	compareAtPrice: string | null;
	inventoryQuantity: number | null;
	inventoryItem: { id: string } | null;
	media: { nodes: { id?: string }[] };
	metafields: { edges: { node: MetafieldNode }[] };
}
interface ProductNode {
	id: string;
	handle: string;
	title: string;
	description: string | null;
	descriptionHtml: string | null;
	status: string;
	seo?: { title?: string | null; description?: string | null } | null;
	createdAt: string;
	updatedAt: string;
	variants: { edges: { node: VariantNode }[] };
	metafields: { edges: { node: MetafieldNode }[] };
	media: { nodes: MediaImageNode[] };
}
interface MetaobjectFieldNode {
	key: string;
	value: string | null;
	reference: ({ id: string } & MediaImageNode) | null;
	references: { nodes: { id: string }[] } | null;
}
interface MetaobjectNode {
	id: string;
	handle: string;
	type: string;
	updatedAt: string;
	capabilities?: { publishable?: { status?: string | null } | null } | null;
	fields: MetaobjectFieldNode[];
}

/** Shopify metaobject publishable status (ACTIVE/DRAFT) → our enum */
function mapMetaobjectStatus(node: MetaobjectNode): 'Active' | 'Draft' {
	return node.capabilities?.publishable?.status === 'ACTIVE' ? 'Active' : 'Draft';
}

function client(token: string): Client {
	return createAdminClient(token);
}

function mapProductStatus(s: string): 'Active' | 'Archived' | 'Draft' {
	if (s === 'ACTIVE') return 'Active';
	if (s === 'ARCHIVED') return 'Archived';
	return 'Draft';
}

/** shopifyIds (of `idColumn`) that exist locally AND are dirty — to be skipped */
async function dirtySkipSet(
	db: DbClient,
	rows: { updatedAt: string; lastSyncedAt: string | null; shopifyUpdatedAt: string | null; key: string }[]
): Promise<Set<string>> {
	const skip = new Set<string>();
	for (const r of rows) if (isDirty(r)) skip.add(r.key);
	return skip;
}

// --- Metaobjects (authors / pages) ---

function buildMetaobjectFields(node: MetaobjectNode): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	for (const f of node.fields) {
		if (f.references?.nodes?.length) fields[f.key] = f.references.nodes.map((n) => n.id);
		else if (f.reference) fields[f.key] = f.reference.id;
		else fields[f.key] = f.value;
	}
	return fields;
}

/** MediaImage references on a metaobject's fields (e.g. an author's `image`) */
function extractImageRefs(node: MetaobjectNode) {
	const out: { shopifyId: string; url: string; alt: string | null; width: number | null; height: number | null }[] = [];
	for (const f of node.fields) {
		const ref = f.reference;
		if (ref?.id && ref.image?.url) {
			out.push({ shopifyId: ref.id, url: ref.image.url, alt: ref.alt ?? null, width: ref.image.width, height: ref.image.height });
		}
	}
	return out;
}

export async function importMetaobjects(
	token: string,
	db: DbClient,
	type: 'author' | 'page'
): Promise<{ imported: number; skipped: number }> {
	const c = client(token);
	const nodes: MetaobjectNode[] = [];
	let after: string | null = null;
	for (;;) {
		const r = await withRateLimit(() =>
			c.query<{ metaobjects: { edges: { node: MetaobjectNode }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }>(
				METAOBJECTS,
				{ type, first: 250, after }
			).toPromise()
		);
		if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
		const page = r.data?.metaobjects;
		if (!page) break;
		nodes.push(...page.edges.map((e) => e.node));
		if (!page.pageInfo.hasNextPage) break;
		after = page.pageInfo.endCursor;
	}

	// Determine which existing rows are dirty (skip them)
	const existing = await db
		.select({
			shopifyId: schema.metaobject.shopifyId,
			updatedAt: schema.metaobject.updatedAt,
			lastSyncedAt: schema.metaobject.lastSyncedAt,
			shopifyUpdatedAt: schema.metaobject.shopifyUpdatedAt
		})
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, type));
	const skip = await dirtySkipSet(
		db,
		existing.map((e) => ({ ...e, key: e.shopifyId ?? '' }))
	);

	const now = new Date().toISOString();
	const rows = [];
	const nodeImages: { gid: string; images: ReturnType<typeof extractImageRefs> }[] = [];
	for (const node of nodes) {
		if (skip.has(node.id)) continue;
		const fields = buildMetaobjectFields(node);
		const images = extractImageRefs(node);
		if (images.length) nodeImages.push({ gid: node.id, images });
		const title = (fields.title as string) || (fields.name as string) || node.handle;
		rows.push({
			shopifyId: node.id,
			handle: node.handle,
			type,
			fields,
			title,
			status: mapMetaobjectStatus(node),
			createdAt: node.updatedAt,
			updatedAt: node.updatedAt,
			shopifyUpdatedAt: node.updatedAt,
			lastSyncedAt: now,
			shopifyFieldHash: hashFields(metaobjectManagedFields(fields as never))
		});
	}

	await chunkedUpsert(db, schema.metaobject, rows, { name: 'shopifyId' }, [
		'handle',
		'type',
		'fields',
		'title',
		'status',
		'updatedAt',
		'shopifyUpdatedAt',
		'lastSyncedAt',
		'shopifyFieldHash'
	]);

	// Image references (e.g. author portraits) -> media table
	if (nodeImages.length) {
		// Look up by type (not a big IN list — that blows the SQL-variable / D1
		// 100-param limit for a catalog of images).
		const moIdByGid = new Map(
			(
				await db
					.select({ id: schema.metaobject.id, shopifyId: schema.metaobject.shopifyId })
					.from(schema.metaobject)
					.where(eq(schema.metaobject.type, type))
			).map((m) => [m.shopifyId, m.id])
		);
		const mediaRows: {
			shopifyId: string;
			entityType: 'metaobject';
			entityId: string;
			mediaType: 'image';
			shopifyUrl: string;
			altText: string | null;
			width: number | null;
			height: number | null;
			position: number;
		}[] = [];
		for (const { gid, images } of nodeImages) {
			const localId = moIdByGid.get(gid);
			if (localId == null) continue;
			images.forEach((img, position) =>
				mediaRows.push({
					shopifyId: img.shopifyId,
					entityType: 'metaobject' as const,
					entityId: String(localId),
					mediaType: 'image' as const,
					shopifyUrl: img.url,
					altText: img.alt,
					width: img.width,
					height: img.height,
					position
				})
			);
		}
		await chunkedUpsert(
			db,
			schema.media,
			mediaRows,
			[{ name: 'entityType' }, { name: 'entityId' }, { name: 'shopifyId' }],
			['mediaType', 'shopifyUrl', 'altText', 'width', 'height', 'position']
		);
	}

	// Pages: derive parent_id (+ position) from each parent's sub_pages. parent_id
	// is the LOCAL source of truth for the hierarchy (admin + storefront); Shopify
	// only stores sub_pages, recomputed from parent_id on push. Skip dirty pages so
	// local hierarchy edits aren't clobbered.
	if (type === 'page') {
		const pages = await db
			.select({
				id: schema.metaobject.id,
				shopifyId: schema.metaobject.shopifyId,
				fields: schema.metaobject.fields
			})
			.from(schema.metaobject)
			.where(eq(schema.metaobject.type, 'page'));
		const idByGid = new Map(pages.filter((p) => p.shopifyId).map((p) => [p.shopifyId as string, p.id]));
		const parentByChild = new Map<number, { parentId: number; position: number }>();
		for (const parent of pages) {
			const subs = (parent.fields as { sub_pages?: unknown } | null)?.sub_pages;
			if (!Array.isArray(subs)) continue;
			subs.forEach((gid, position) => {
				if (typeof gid !== 'string') return;
				const childId = idByGid.get(gid);
				if (childId != null) parentByChild.set(childId, { parentId: parent.id, position });
			});
		}
		const stmts = pages
			.filter((p) => !skip.has(p.shopifyId ?? ''))
			.map((p) => {
				const d = parentByChild.get(p.id);
				return db
					.update(schema.metaobject)
					.set({ parentId: d?.parentId ?? null, position: d?.position ?? 0 })
					.where(eq(schema.metaobject.id, p.id));
			});
		for (let i = 0; i < stmts.length; i += BATCH) {
			await (db as AnyDb).batch(stmts.slice(i, i + BATCH));
		}
	}

	return { imported: rows.length, skipped: skip.size };
}

// --- Products (one Shopify page per call) ---

export async function importProductPage(
	token: string,
	db: DbClient,
	after: string | null
): Promise<{ imported: number; skipped: number; nextCursor: string | null }> {
	const c = client(token);
	const r = await withRateLimit(() =>
		c.query<{ products: { edges: { node: ProductNode }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }>(
			PRODUCTS,
			{ first: PRODUCTS_PER_PAGE, after }
		).toPromise()
	);
	if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
	const page = r.data?.products;
	if (!page) return { imported: 0, skipped: 0, nextCursor: null };

	const nodes = page.edges.map((e) => e.node);
	const shopifyIds = nodes.map((n) => extractNumericId(n.id));

	const existing = shopifyIds.length
		? await db
				.select({
					shopifyId: schema.product.shopifyId,
					updatedAt: schema.product.updatedAt,
					lastSyncedAt: schema.product.lastSyncedAt,
					shopifyUpdatedAt: schema.product.shopifyUpdatedAt
				})
				.from(schema.product)
				.where(inArray(schema.product.shopifyId, shopifyIds))
		: [];
	const skip = await dirtySkipSet(db, existing.map((e) => ({ ...e, key: e.shopifyId ?? '' })));

	const now = new Date().toISOString();
	const productRows = [];
	const variantRows = [];
	const metafieldRows = [];
	const mediaRows: {
		shopifyId: string;
		_shopifyProductId: string;
		entityType: 'product';
		mediaType: 'image';
		shopifyUrl: string;
		altText: string | null;
		width: number | null;
		height: number | null;
		position: number;
	}[] = [];

	for (const node of nodes) {
		const shopifyId = extractNumericId(node.id);
		if (skip.has(shopifyId)) continue;

		const description = node.descriptionHtml || node.description || '';
		const status = mapProductStatus(node.status);
		productRows.push({
			shopifyId,
			handle: node.handle || slugify(node.title),
			title: node.title,
			description,
			status,
			seoTitle: node.seo?.title ?? null,
			seoDescription: node.seo?.description ?? null,
			priceCurrency: 'SEK' as const,
			createdAt: node.createdAt,
			updatedAt: node.updatedAt,
			shopifyUpdatedAt: node.updatedAt,
			lastSyncedAt: now,
			// authors folded in by linkProducts; placeholder here
			shopifyFieldHash: hashFields(productManagedFields({ title: node.title, description, status }, []))
		});

		for (const ve of node.variants.edges) {
			const v = ve.node;
			const price = parseFloat(v.price);
			variantRows.push({
				id: v.id,
				productId: 0, // resolved below after products upsert
				_shopifyProductId: shopifyId, // transient
				title: v.title,
				sku: v.sku,
				barcode: v.barcode,
				price,
				compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : null,
				inventoryQuantity: v.inventoryQuantity ?? 0,
				inventoryItemId: v.inventoryItem?.id ?? null,
				imageShopifyId: v.media.nodes.find((m) => m.id)?.id ?? null,
				requiresShipping: true,
				taxable: true,
				weight: null,
				weightUnit: null,
				updatedAt: node.updatedAt,
				shopifyUpdatedAt: node.updatedAt,
				lastSyncedAt: now,
				shopifyFieldHash: hashFields(variantManagedFields({ price, sku: v.sku, title: v.title }))
			});
			for (const me of v.metafields.edges) {
				const m = me.node;
				if (m.value == null) continue;
				metafieldRows.push({ id: m.id, ownerId: v.id, ownerType: 'variant' as const, namespace: m.namespace, key: m.key, value: m.value, type: m.type });
			}
		}
		for (const me of node.metafields.edges) {
			const m = me.node;
			if (m.value == null) continue;
			metafieldRows.push({ id: m.id, ownerId: node.id, ownerType: 'product' as const, namespace: m.namespace, key: m.key, value: m.value, type: m.type });
		}
		node.media.nodes.forEach((m, position) => {
			if (!m.id || !m.image?.url) return; // skip non-image media
			mediaRows.push({
				shopifyId: m.id,
				_shopifyProductId: shopifyId, // transient — resolved to local id below
				entityType: 'product' as const,
				mediaType: 'image' as const,
				shopifyUrl: m.image.url,
				altText: m.alt ?? null,
				width: m.image.width,
				height: m.image.height,
				position
			});
		});
	}

	await chunkedUpsert(db, schema.product, productRows, { name: 'shopifyId' }, [
		'handle',
		'title',
		'description',
		'status',
		'seoTitle',
		'seoDescription',
		'updatedAt',
		'shopifyUpdatedAt',
		'lastSyncedAt',
		'shopifyFieldHash'
	]);

	// Resolve local product ids for the variants we kept, then upsert variants
	const idMap = new Map(
		(
			await db
				.select({ id: schema.product.id, shopifyId: schema.product.shopifyId })
				.from(schema.product)
				.where(inArray(schema.product.shopifyId, productRows.map((p) => p.shopifyId)))
		).map((p) => [p.shopifyId, p.id])
	);
	const variantsResolved = variantRows
		.map(({ _shopifyProductId, ...v }) => ({ ...v, productId: idMap.get(_shopifyProductId) ?? 0 }))
		.filter((v) => v.productId !== 0);

	await chunkedUpsert(db, schema.variant, variantsResolved, { name: 'id' }, [
		'productId',
		'title',
		'sku',
		'barcode',
		'price',
		'compareAtPrice',
		'inventoryQuantity',
		'inventoryItemId',
		'imageShopifyId',
		'updatedAt',
		'shopifyUpdatedAt',
		'lastSyncedAt',
		'shopifyFieldHash'
	]);
	await chunkedUpsert(db, schema.metafield, metafieldRows, { name: 'id' }, [
		'ownerId',
		'ownerType',
		'namespace',
		'key',
		'value',
		'type'
	]);

	const mediaResolved = mediaRows
		.map(({ _shopifyProductId, ...m }) => ({ ...m, entityId: String(idMap.get(_shopifyProductId) ?? '') }))
		.filter((m) => m.entityId !== '');
	await chunkedUpsert(
		db,
		schema.media,
		mediaResolved,
		[{ name: 'entityType' }, { name: 'entityId' }, { name: 'shopifyId' }],
		['mediaType', 'shopifyUrl', 'altText', 'width', 'height', 'position']
	);

	// Resolve each variant's assigned image (image_shopify_id gid) to the local
	// media row on the SAME product — constrained by entity_id so a shared gid
	// can't match another product's row. Scoped to this page's products.
	const localProductIds = [...idMap.values()];
	if (localProductIds.length) {
		await (db as AnyDb).run(sql`
			UPDATE variant
			SET image_id = (
				SELECT m.id FROM media m
				WHERE m.shopify_id = variant.image_shopify_id
					AND m.entity_type = 'product'
					AND m.entity_id = CAST(variant.product_id AS TEXT)
				LIMIT 1
			)
			WHERE variant.image_shopify_id IS NOT NULL
				AND variant.product_id IN (${sql.join(localProductIds, sql`, `)})
		`);
	}

	return {
		imported: productRows.length,
		skipped: skip.size,
		nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
	};
}

// --- Links (derive product<->metaobject links from metafields; local only) ---

/**
 * Derive product↔metaobject links (author/category) from metafields, one bounded
 * batch of products per call (cursor = last product id). Bounded so each request
 * stays under the free-tier CPU (~10ms) / subrequest (50) / D1 100-param limits;
 * the caller loops until `nextCursor` is null.
 */
const LINK_CHUNK = 25;

export async function linkProducts(
	db: DbClient,
	afterId = 0
): Promise<{ linked: number; nextCursor: number | null }> {
	const products = await db
		.select()
		.from(schema.product)
		.where(gt(schema.product.id, afterId))
		.orderBy(schema.product.id)
		.limit(LINK_CHUNK);
	if (products.length === 0) return { linked: 0, nextCursor: null };

	// Metaobjects (small) for gid<->local-id resolution.
	const metaobjects = await db
		.select({ id: schema.metaobject.id, shopifyId: schema.metaobject.shopifyId })
		.from(schema.metaobject);
	const moByGid = new Map(metaobjects.map((m) => [m.shopifyId ?? '', m.id]));
	const gidById = new Map(metaobjects.map((m) => [m.id, m.shopifyId ?? '']));

	// Only this chunk's variants + reference metafields (kept under 100 params).
	const productIds = products.map((p) => p.id);
	const productGids = products.map((p) => `gid://shopify/Product/${p.shopifyId}`);
	const variants = await db
		.select({ id: schema.variant.id, productId: schema.variant.productId })
		.from(schema.variant)
		.where(inArray(schema.variant.productId, productIds));
	const variantsByProduct = new Map<number, string[]>();
	const variantIds: string[] = [];
	for (const v of variants) {
		const list = variantsByProduct.get(v.productId) ?? [];
		list.push(v.id);
		variantsByProduct.set(v.productId, list);
		variantIds.push(v.id);
	}

	const authorMfs = await db
		.select({ ownerId: schema.metafield.ownerId, value: schema.metafield.value })
		.from(schema.metafield)
		.where(
			and(
				eq(schema.metafield.namespace, 'custom'),
				eq(schema.metafield.key, 'authors'),
				inArray(schema.metafield.ownerId, productGids)
			)
		);
	const authorByOwner = new Map(authorMfs.map((m) => [m.ownerId, m.value]));
	const catByOwner = new Map<string, string | null>();
	if (variantIds.length > 0) {
		const catMfs = await db
			.select({ ownerId: schema.metafield.ownerId, value: schema.metafield.value })
			.from(schema.metafield)
			.where(
				and(
					eq(schema.metafield.namespace, 'book'),
					eq(schema.metafield.key, 'category'),
					inArray(schema.metafield.ownerId, variantIds)
				)
			);
		for (const m of catMfs) catByOwner.set(m.ownerId, m.value);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const stmts: any[] = [];
	let linked = 0;
	for (const product of products) {
		if (isDirty({ updatedAt: product.updatedAt, lastSyncedAt: product.lastSyncedAt, shopifyUpdatedAt: product.shopifyUpdatedAt })) {
			continue; // leave dirty products' links + hash alone
		}

		const authorIds = parseGidList(authorByOwner.get(`gid://shopify/Product/${product.shopifyId}`))
			.map((g) => moByGid.get(g))
			.filter((x): x is number => x != null);

		const catGids = new Set<string>();
		for (const vid of variantsByProduct.get(product.id) ?? []) {
			for (const g of parseGidList(catByOwner.get(vid))) catGids.add(g);
		}
		const categoryIds = [...catGids].map((g) => moByGid.get(g)).filter((x): x is number => x != null);

		stmts.push(
			db
				.delete(schema.productsToMetaobjects)
				.where(
					and(
						eq(schema.productsToMetaobjects.productId, product.id),
						inArray(schema.productsToMetaobjects.relationType, ['category', 'author'])
					)
				)
		);
		authorIds.forEach((metaobjectId, position) =>
			stmts.push(
				db
					.insert(schema.productsToMetaobjects)
					.values({ productId: product.id, metaobjectId, relationType: 'author', position })
					.onConflictDoNothing()
			)
		);
		categoryIds.forEach((metaobjectId, position) =>
			stmts.push(
				db
					.insert(schema.productsToMetaobjects)
					.values({ productId: product.id, metaobjectId, relationType: 'category', position })
					.onConflictDoNothing()
			)
		);
		// Correct the product field hash now that author links are known
		const authorGids = authorIds.map((id) => gidById.get(id) ?? '').filter(Boolean);
		stmts.push(
			db
				.update(schema.product)
				.set({ shopifyFieldHash: hashFields(productManagedFields(product, authorGids)) })
				.where(eq(schema.product.id, product.id))
		);
		linked += authorIds.length + categoryIds.length;
	}

	for (let i = 0; i < stmts.length; i += BATCH) {
		await (db as AnyDb).batch(stmts.slice(i, i + BATCH));
	}

	const nextCursor = products.length === LINK_CHUNK ? products[products.length - 1].id : null;
	return { linked, nextCursor };
}

function parseGidList(value: string | null | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
		if (typeof parsed === 'string') return [parsed];
	} catch {
		/* not JSON */
	}
	return [];
}

void gidList; // re-exported helper kept available
