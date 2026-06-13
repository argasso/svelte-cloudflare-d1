/**
 * Shopify Admin API gateway for sync — typed via gql.tada against the Admin
 * schema (src/lib/graphql-admin.ts). Reads are low-risk; writes go through
 * `decideSync` upstream and are only called on an explicit apply.
 */
import type { Client } from '@urql/core';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { graphqlAdmin } from '$lib/graphql-admin';

export type SyncEntityType = 'product' | 'variant' | 'metaobject';

export interface MetaobjectWrite {
	handle?: string;
	/** Shopify metaobject status; we map Archived -> DRAFT */
	status?: 'ACTIVE' | 'DRAFT';
	/** Field values as Shopify expects: array of { key, value:string } */
	fields: { key: string; value: string }[];
}

export interface ProductWrite {
	title: string;
	descriptionHtml: string;
	status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
}

export interface VariantWrite {
	/** Variant gid */
	id: string;
	price: string;
	sku?: string | null;
}

export interface MetafieldSet {
	ownerId: string;
	namespace: string;
	key: string;
	type: string;
	value: string;
}

export interface ShopifyGateway {
	/** Read the current Shopify `updatedAt` for an entity (null if not found) */
	getUpdatedAt(type: SyncEntityType, gid: string): Promise<string | null>;
	/** Push a metaobject; returns the new updatedAt on success */
	updateMetaobject(gid: string, write: MetaobjectWrite): Promise<{ updatedAt: string }>;
	/** Push product core fields; returns the new updatedAt */
	updateProduct(gid: string, write: ProductWrite): Promise<{ updatedAt: string }>;
	/** Push variant price/sku via productVariantsBulkUpdate */
	updateVariant(productGid: string, write: VariantWrite): Promise<void>;
	/** Upsert metafields (owner + namespace + key) */
	setMetafields(metafields: MetafieldSet[]): Promise<void>;
}

const ProductUpdatedAt = graphqlAdmin(`query ProductUpdatedAt($id: ID!) {
	product(id: $id) { id updatedAt }
}`);

const VariantUpdatedAt = graphqlAdmin(`query VariantUpdatedAt($id: ID!) {
	productVariant(id: $id) { id updatedAt }
}`);

const MetaobjectUpdatedAt = graphqlAdmin(`query MetaobjectUpdatedAt($id: ID!) {
	metaobject(id: $id) { id updatedAt }
}`);

const MetaobjectUpdate = graphqlAdmin(`mutation SyncMetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
	metaobjectUpdate(id: $id, metaobject: $metaobject) {
		metaobject { id updatedAt }
		userErrors { field message code }
	}
}`);

const ProductUpdate = graphqlAdmin(`mutation SyncProductUpdate($product: ProductUpdateInput!) {
	productUpdate(product: $product) {
		product { id updatedAt }
		userErrors { field message }
	}
}`);

const VariantsBulkUpdate = graphqlAdmin(`mutation SyncVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
	productVariantsBulkUpdate(productId: $productId, variants: $variants) {
		productVariants { id updatedAt }
		userErrors { field message }
	}
}`);

const MetafieldsSet = graphqlAdmin(`mutation SyncMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
	metafieldsSet(metafields: $metafields) {
		metafields { id }
		userErrors { field message }
	}
}`);

export function createShopifyGateway(accessToken: string): ShopifyGateway {
	const client: Client = createAdminClient(accessToken);

	return {
		async getUpdatedAt(type, gid) {
			if (type === 'product') {
				const r = await withRateLimit(() => client.query(ProductUpdatedAt, { id: gid }).toPromise());
				if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
				return r.data?.product?.updatedAt ?? null;
			}
			if (type === 'variant') {
				const r = await withRateLimit(() => client.query(VariantUpdatedAt, { id: gid }).toPromise());
				if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
				return r.data?.productVariant?.updatedAt ?? null;
			}
			const r = await withRateLimit(() => client.query(MetaobjectUpdatedAt, { id: gid }).toPromise());
			if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
			return r.data?.metaobject?.updatedAt ?? null;
		},

		async updateMetaobject(gid, write) {
			const r = await withRateLimit(() =>
				client
					.mutation(MetaobjectUpdate, {
						id: gid,
						metaobject: {
							...(write.handle ? { handle: write.handle } : {}),
							...(write.status
								? { capabilities: { publishable: { status: write.status } } }
								: {}),
							fields: write.fields
						}
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.metaobjectUpdate;
			if (payload?.userErrors?.length) {
				throw new Error(
					`metaobjectUpdate userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`
				);
			}
			const updatedAt = payload?.metaobject?.updatedAt;
			if (!updatedAt) throw new Error('metaobjectUpdate returned no updatedAt');
			return { updatedAt };
		},

		async updateProduct(gid, write) {
			const r = await withRateLimit(() =>
				client
					.mutation(ProductUpdate, {
						product: {
							id: gid,
							title: write.title,
							descriptionHtml: write.descriptionHtml,
							status: write.status
						}
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.productUpdate;
			if (payload?.userErrors?.length) {
				throw new Error(`productUpdate userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`);
			}
			const updatedAt = payload?.product?.updatedAt;
			if (!updatedAt) throw new Error('productUpdate returned no updatedAt');
			return { updatedAt };
		},

		async updateVariant(productGid, write) {
			const r = await withRateLimit(() =>
				client
					.mutation(VariantsBulkUpdate, {
						productId: productGid,
						variants: [
							{
								id: write.id,
								price: write.price,
								...(write.sku != null ? { inventoryItem: { sku: write.sku } } : {})
							}
						]
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const errs = r.data?.productVariantsBulkUpdate?.userErrors;
			if (errs?.length) {
				throw new Error(`productVariantsBulkUpdate userErrors: ${errs.map((e) => e.message).join('; ')}`);
			}
		},

		async setMetafields(metafields) {
			if (metafields.length === 0) return;
			const r = await withRateLimit(() =>
				client.mutation(MetafieldsSet, { metafields }).toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const errs = r.data?.metafieldsSet?.userErrors;
			if (errs?.length) {
				throw new Error(`metafieldsSet userErrors: ${errs.map((e) => e.message).join('; ')}`);
			}
		}
	};
}
