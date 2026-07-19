/**
 * Discard local edits by pulling a record's current version from Shopify and
 * overwriting the local row (the inverse of a push). Used for "Revert to
 * Shopify" on a dirty record. Resets the sync watermark so the row is no longer
 * dirty. Unlike the webhook there's no dirty guard — reverting is deliberate.
 */
import { eq } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { graphqlAdmin } from '$lib/graphql-admin';
import {
	hashFields,
	metaobjectManagedFields,
	productManagedFields,
	variantManagedFields
} from './fields';
import { rebuildProductLinks } from './links';
import { MANAGED_PRODUCT_NS, MANAGED_VARIANT_NS, syncMetafields } from './webhook';

const productGid = (id: string) => (id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`);
const productStatus = (s: string): 'Active' | 'Archived' | 'Draft' =>
	s === 'ACTIVE' ? 'Active' : s === 'ARCHIVED' ? 'Archived' : 'Draft';

const RevertProductQuery = graphqlAdmin(`query RevertProduct($id: ID!) {
	product(id: $id) {
		title
		descriptionHtml
		status
		updatedAt
		seo { title description }
		metafields(first: 30) { nodes { id namespace key value type } }
		variants(first: 25) {
			nodes { id title price sku barcode updatedAt metafields(first: 20) { nodes { id namespace key value type } } }
		}
	}
}`);

export async function revertProductFromShopify(
	db: DbClient,
	productId: number,
	token: string
): Promise<void> {
	const row = await db.query.product.findFirst({
		where: eq(schema.product.id, productId),
		columns: { id: true, shopifyId: true }
	});
	if (!row?.shopifyId) throw new Error('Product has no Shopify id');
	const gid = productGid(row.shopifyId);

	const client = createAdminClient(token);
	const r = await withRateLimit(() => client.query(RevertProductQuery, { id: gid }).toPromise());
	const p = r.data?.product;
	if (r.error || !p) throw new Error('Could not fetch product from Shopify');

	const now = new Date().toISOString();
	const title = p.title;
	const description = p.descriptionHtml ?? '';
	const status = productStatus(p.status);
	const updatedAt = p.updatedAt ?? now;

	await db
		.update(schema.product)
		.set({
			title,
			description,
			status,
			seoTitle: p.seo?.title ?? null,
			seoDescription: p.seo?.description ?? null,
			updatedAt,
			shopifyUpdatedAt: updatedAt,
			lastSyncedAt: now
		})
		.where(eq(schema.product.id, productId));

	for (const v of p.variants.nodes) {
		const vrow = await db.query.variant.findFirst({ where: eq(schema.variant.id, v.id) });
		if (!vrow) continue;
		const price = v.price != null ? parseFloat(v.price) : vrow.price;
		const sku = v.sku ?? null;
		const title = v.title ?? vrow.title;
		const vUpdatedAt = v.updatedAt ?? updatedAt;
		await db
			.update(schema.variant)
			.set({
				title,
				price,
				sku,
				barcode: v.barcode ?? null,
				updatedAt: vUpdatedAt,
				shopifyUpdatedAt: vUpdatedAt,
				lastSyncedAt: now,
				shopifyFieldHash: hashFields(variantManagedFields({ price, sku, title }))
			})
			.where(eq(schema.variant.id, v.id));
		await syncMetafields(db, v.id, 'variant', v.metafields.nodes, MANAGED_VARIANT_NS);
	}
	await syncMetafields(db, gid, 'product', p.metafields.nodes, MANAGED_PRODUCT_NS);

	const authors = await rebuildProductLinks(db, productId);
	await db
		.update(schema.product)
		.set({ shopifyFieldHash: hashFields(productManagedFields({ title, description, status }, authors)) })
		.where(eq(schema.product.id, productId));
}

const RevertMetaobjectQuery = graphqlAdmin(`query RevertMetaobject($id: ID!) {
	metaobject(id: $id) {
		handle
		updatedAt
		capabilities { publishable { status } }
		fields { key value }
	}
}`);

export async function revertMetaobjectFromShopify(
	db: DbClient,
	metaobjectId: number,
	token: string
): Promise<void> {
	const row = await db.query.metaobject.findFirst({
		where: eq(schema.metaobject.id, metaobjectId),
		columns: { id: true, shopifyId: true }
	});
	if (!row?.shopifyId) throw new Error('Metaobject has no Shopify id');

	const client = createAdminClient(token);
	const r = await withRateLimit(() =>
		client.query(RevertMetaobjectQuery, { id: row.shopifyId! }).toPromise()
	);
	const m = r.data?.metaobject;
	if (r.error || !m) throw new Error('Could not fetch metaobject from Shopify');

	const fields: Record<string, unknown> = {};
	for (const f of m.fields) if (f.value != null) fields[f.key] = f.value;
	const status = m.capabilities?.publishable?.status === 'ACTIVE' ? 'Active' : 'Draft';
	const now = new Date().toISOString();
	const updatedAt = m.updatedAt ?? now;

	await db
		.update(schema.metaobject)
		.set({
			handle: m.handle ?? undefined,
			fields: fields as typeof schema.metaobject.$inferSelect.fields,
			status,
			updatedAt,
			shopifyUpdatedAt: updatedAt,
			lastSyncedAt: now,
			shopifyFieldHash: hashFields(
				metaobjectManagedFields(fields as typeof schema.metaobject.$inferSelect.fields)
			)
		})
		.where(eq(schema.metaobject.id, metaobjectId));
}
