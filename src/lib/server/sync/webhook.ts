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
import { rebuildProductLinks } from './links';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { graphqlAdmin } from '$lib/graphql-admin';

/**
 * The REST product webhook payload omits SEO and metafields, so fetch them from
 * the Admin API — metafields are most of the book data (binding, category, age,
 * translation/audiobook fields, authors) and wouldn't sync otherwise.
 */
const ProductDetails = graphqlAdmin(`query WebhookProductDetails($id: ID!) {
	product(id: $id) {
		seo { title description }
		metafields(first: 30) { nodes { id namespace key value type } }
		variants(first: 25) {
			nodes { id metafields(first: 20) { nodes { id namespace key value type } } }
		}
	}
}`);

type MfNode = { id: string; namespace: string; key: string; value: string | null; type: string };
interface FetchedProduct {
	seo: { title: string | null; description: string | null };
	metafields: MfNode[];
	variants: { id: string; metafields: MfNode[] }[];
}

async function fetchProductDetails(token: string, gid: string): Promise<FetchedProduct | null> {
	try {
		const client = createAdminClient(token);
		const r = await withRateLimit(() => client.query(ProductDetails, { id: gid }).toPromise());
		const p = r.data?.product;
		if (r.error || !p) return null;
		return {
			seo: { title: p.seo?.title ?? null, description: p.seo?.description ?? null },
			metafields: p.metafields.nodes,
			variants: p.variants.nodes.map((v) => ({ id: v.id, metafields: v.metafields.nodes }))
		};
	} catch {
		return null;
	}
}

// Metafield namespaces the app manages, per owner type. Only these are synced
// (upserted/deleted) from Shopify, so unrelated namespaces are left untouched.
export const MANAGED_VARIANT_NS = ['book', 'translated_book', 'audio_book'];
export const MANAGED_PRODUCT_NS = ['custom'];
export type { MfNode };

/** Upsert a owner's managed metafields to match Shopify; delete removed ones. */
export async function syncMetafields(
	db: DbClient,
	ownerId: string,
	ownerType: 'product' | 'variant',
	fetched: MfNode[],
	managedNs: string[]
): Promise<void> {
	const managed = fetched.filter((m) => managedNs.includes(m.namespace) && m.value != null);
	const existing = await db
		.select()
		.from(schema.metafield)
		.where(eq(schema.metafield.ownerId, ownerId));
	const existingByKey = new Map(existing.map((e) => [`${e.namespace}.${e.key}`, e]));
	const seen = new Set<string>();
	const now = new Date().toISOString();

	for (const m of managed) {
		const k = `${m.namespace}.${m.key}`;
		seen.add(k);
		const cur = existingByKey.get(k);
		if (cur) {
			if (cur.value !== m.value || cur.type !== m.type) {
				await db
					.update(schema.metafield)
					.set({ value: m.value!, type: m.type, updatedAt: now })
					.where(eq(schema.metafield.id, cur.id));
			}
		} else {
			await db.insert(schema.metafield).values({
				id: m.id,
				ownerId,
				ownerType,
				namespace: m.namespace,
				key: m.key,
				value: m.value!,
				type: m.type
			});
		}
	}
	// Managed metafields that vanished in Shopify are removed locally.
	for (const e of existing) {
		if (managedNs.includes(e.namespace) && !seen.has(`${e.namespace}.${e.key}`)) {
			await db.delete(schema.metafield).where(eq(schema.metafield.id, e.id));
		}
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

	const gid = `gid://shopify/Product/${shopifyId}`;
	const title = payload.title ?? row.title;
	const description = payload.body_html ?? '';
	const status = mapProductStatus(payload.status);
	const updatedAt = payload.updated_at ?? new Date().toISOString();
	const now = new Date().toISOString();

	// SEO and metafields aren't in the REST webhook payload — fetch from the Admin
	// API. Falls back to current local values if the lookup is unavailable.
	let seoTitle = row.seoTitle;
	let seoDescription = row.seoDescription;
	const details = token ? await fetchProductDetails(token, gid) : null;
	if (details) {
		seoTitle = details.seo.title;
		seoDescription = details.seo.description;
	}

	// Product core fields; the field hash is corrected after links are rebuilt.
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
			lastSyncedAt: now
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

	// Sync managed metafields (skipping dirty variants), then rebuild the derived
	// author/category links from them and correct the product field hash.
	if (details) {
		for (const fv of details.variants) {
			const vrow = await db.query.variant.findFirst({ where: eq(schema.variant.id, fv.id) });
			if (!vrow || dirtyState(vrow)) continue;
			await syncMetafields(db, fv.id, 'variant', fv.metafields, MANAGED_VARIANT_NS);
		}
		await syncMetafields(db, gid, 'product', details.metafields, MANAGED_PRODUCT_NS);
	}

	const authors = await rebuildProductLinks(db, row.id);
	await db
		.update(schema.product)
		.set({ shopifyFieldHash: hashFields(productManagedFields({ title, description, status }, authors)) })
		.where(eq(schema.product.id, row.id));

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
