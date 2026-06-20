/**
 * Inbound Shopify webhooks (Shopify -> D1).
 *
 * Keeps the local copy and the sync base (`shopifyUpdatedAt`) fresh when data
 * changes in Shopify, so later pushes don't raise false conflicts. Webhook
 * payloads are REST-shaped (snake_case, numeric ids, lowercase status) — not
 * the GraphQL Admin shape.
 *
 * Safety: a webhook never overwrites a row with unpushed local edits (dirty).
 * For dirty rows it records the remote change and leaves the row alone, so the
 * normal conflict detection surfaces it at push time.
 */
import { eq } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { isDirty } from './conflict';
import { hashFields, productManagedFields, variantManagedFields, metaobjectManagedFields } from './fields';
import { linkGids } from './index';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { graphqlAdmin } from '$lib/graphql-admin';

// The REST product webhook payload omits SEO, so fetch it from the Admin API.
const ProductSeo = graphqlAdmin(`query WebhookProductSeo($id: ID!) {
	product(id: $id) { seo { title description } }
}`);

async function fetchProductSeo(
	token: string,
	gid: string
): Promise<{ title: string | null; description: string | null } | null> {
	try {
		const client = createAdminClient(token);
		const r = await withRateLimit(() => client.query(ProductSeo, { id: gid }).toPromise());
		if (r.error || !r.data?.product) return null;
		return {
			title: r.data.product.seo?.title ?? null,
			description: r.data.product.seo?.description ?? null
		};
	} catch {
		return null;
	}
}

export type WebhookOutcome =
	| { action: 'updated'; entity: string; id: string }
	| { action: 'conflict'; entity: string; id: string; reason: string }
	| { action: 'skipped'; entity: string; reason: string };

function dirtyState(row: { updatedAt: string; lastSyncedAt: string | null; shopifyUpdatedAt: string | null }) {
	return isDirty({ updatedAt: row.updatedAt, lastSyncedAt: row.lastSyncedAt, shopifyUpdatedAt: row.shopifyUpdatedAt });
}

function mapProductStatus(status: unknown): 'Active' | 'Archived' | 'Draft' {
	if (status === 'active') return 'Active';
	if (status === 'archived') return 'Archived';
	return 'Draft';
}

/** Verify Shopify's HMAC-SHA256 over the raw request body (base64), constant-time. */
export async function verifyShopifyHmac(
	rawBody: string,
	hmacHeader: string | null,
	secret: string
): Promise<boolean> {
	if (!hmacHeader) return false;
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
	const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
	return timingSafeEqual(computed, hmacHeader);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

interface ProductPayload {
	id: number;
	title?: string;
	body_html?: string | null;
	status?: string;
	updated_at?: string;
	variants?: { id: number; price?: string; sku?: string | null }[];
}

export async function applyProductWebhook(
	db: DbClient,
	payload: ProductPayload,
	token?: string
): Promise<WebhookOutcome> {
	const shopifyId = String(payload.id);
	const row = await db.query.product.findFirst({ where: eq(schema.product.shopifyId, shopifyId) });
	if (!row) return { action: 'skipped', entity: 'product', reason: 'unknown id ' + shopifyId };
	if (dirtyState(row)) return { action: 'conflict', entity: 'product', id: shopifyId, reason: 'local edits pending' };

	const title = payload.title ?? row.title;
	const description = payload.body_html ?? '';
	const status = mapProductStatus(payload.status);
	const updatedAt = payload.updated_at ?? new Date().toISOString();
	const now = new Date().toISOString();

	// SEO isn't in the REST webhook payload — fetch it from the Admin API. Falls
	// back to the current local values if the lookup is unavailable.
	let seoTitle = row.seoTitle;
	let seoDescription = row.seoDescription;
	if (token) {
		const seo = await fetchProductSeo(token, `gid://shopify/Product/${shopifyId}`);
		if (seo) {
			seoTitle = seo.title;
			seoDescription = seo.description;
		}
	}

	// Author links aren't carried in the product webhook payload; keep the
	// current links so the hash matches what getFields reads on the next sync.
	const { authors } = await linkGids(db, row.id);

	await db
		.update(schema.product)
		.set({
			title,
			description,
			status,
			seoTitle,
			seoDescription,
			updatedAt,
			shopifyUpdatedAt: updatedAt,
			lastSyncedAt: now,
			shopifyFieldHash: hashFields(productManagedFields({ title, description, status }, authors))
		})
		.where(eq(schema.product.id, row.id));

	// Variants ride along on products/update; refresh non-dirty ones
	for (const v of payload.variants ?? []) {
		const vid = `gid://shopify/ProductVariant/${v.id}`;
		const vrow = await db.query.variant.findFirst({ where: eq(schema.variant.id, vid) });
		if (!vrow || dirtyState(vrow)) continue;
		const price = v.price != null ? parseFloat(v.price) : vrow.price;
		const sku = v.sku ?? vrow.sku;
		await db
			.update(schema.variant)
			.set({
				price,
				sku,
				updatedAt,
				shopifyUpdatedAt: updatedAt,
				lastSyncedAt: now,
				shopifyFieldHash: hashFields(variantManagedFields({ price, sku }))
			})
			.where(eq(schema.variant.id, vid));
	}

	return { action: 'updated', entity: 'product', id: shopifyId };
}

interface MetaobjectPayload {
	id: string | number;
	handle?: string;
	updated_at?: string;
	// Shopify sends fields either as [{key,value}] or as a {key: value} map
	fields?: { key: string; value: string | null }[] | Record<string, unknown>;
}

/** Normalize the metaobject webhook's fields (either shape) into our fields object */
function metaobjectFieldsFromPayload(fields: MetaobjectPayload['fields']): Record<string, unknown> {
	if (!fields) return {};
	if (Array.isArray(fields)) {
		const out: Record<string, unknown> = {};
		for (const f of fields) if (f.value != null) out[f.key] = f.value;
		return out;
	}
	return fields;
}

export async function applyMetaobjectWebhook(db: DbClient, payload: MetaobjectPayload): Promise<WebhookOutcome> {
	const gid = String(payload.id);
	const row = await db.query.metaobject.findFirst({ where: eq(schema.metaobject.shopifyId, gid) });
	if (!row) return { action: 'skipped', entity: 'metaobject', reason: 'unknown id ' + gid };
	if (dirtyState(row)) return { action: 'conflict', entity: 'metaobject', id: gid, reason: 'local edits pending' };

	const fields = metaobjectFieldsFromPayload(payload.fields) as typeof row.fields;
	const updatedAt = payload.updated_at ?? new Date().toISOString();
	const now = new Date().toISOString();

	await db
		.update(schema.metaobject)
		.set({
			handle: payload.handle ?? row.handle,
			fields,
			updatedAt,
			shopifyUpdatedAt: updatedAt,
			lastSyncedAt: now,
			shopifyFieldHash: hashFields(metaobjectManagedFields(fields))
		})
		.where(eq(schema.metaobject.id, row.id));

	return { action: 'updated', entity: 'metaobject', id: gid };
}

/** Dispatch a verified webhook by topic. Returns the outcome (also logged by the route). */
export async function handleWebhook(
	db: DbClient,
	topic: string,
	payload: unknown,
	token?: string
): Promise<WebhookOutcome> {
	if (topic.startsWith('products/') && !topic.endsWith('/delete')) {
		return applyProductWebhook(db, payload as ProductPayload, token);
	}
	if (topic.startsWith('metaobjects/') && !topic.endsWith('/delete')) {
		return applyMetaobjectWebhook(db, payload as MetaobjectPayload);
	}
	return { action: 'skipped', entity: topic, reason: 'unhandled topic' };
}
