/**
 * Shopify Admin API gateway for sync — typed via gql.tada against the Admin
 * schema (src/lib/graphql-admin.ts). Reads are low-risk; writes go through
 * `decideSync` upstream and are only called on an explicit apply.
 */
import type { Client } from '@urql/core';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';
import { graphqlAdmin } from '$lib/graphql-admin';
import {
	gidList,
	metaobjectManagedFieldsFromRemote,
	type ManagedFields
} from './fields';

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
	/** MediaImage gid for the variant's selected image (must belong to the product) */
	mediaId?: string | null;
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
	/** Read the current Shopify values of an entity's managed fields (null if not found) */
	getFields(type: SyncEntityType, gid: string): Promise<ManagedFields | null>;
	/** Push a metaobject; returns the new updatedAt on success */
	updateMetaobject(gid: string, write: MetaobjectWrite): Promise<{ updatedAt: string }>;
	/** Push product core fields; returns the new updatedAt */
	updateProduct(gid: string, write: ProductWrite): Promise<{ updatedAt: string }>;
	/** Push variant price/sku via productVariantsBulkUpdate */
	updateVariant(productGid: string, write: VariantWrite): Promise<void>;
	/** Upsert metafields (owner + namespace + key) */
	setMetafields(metafields: MetafieldSet[]): Promise<void>;
	/**
	 * Append images to a product from public URLs (Shopify fetches them).
	 * Returns the created MediaImage gids in the same order as `media`.
	 */
	createProductMedia(
		productGid: string,
		media: { originalSource: string; alt?: string | null }[]
	): Promise<string[]>;
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

const ProductFields = graphqlAdmin(`query ProductFields($id: ID!) {
	product(id: $id) {
		id
		title
		descriptionHtml
		status
		authors: metafield(namespace: "custom", key: "authors") { value }
	}
}`);

const VariantFields = graphqlAdmin(`query VariantFields($id: ID!) {
	productVariant(id: $id) { id price inventoryItem { sku } }
}`);

const MetaobjectFields = graphqlAdmin(`query MetaobjectFields($id: ID!) {
	metaobject(id: $id) { id fields { key value } }
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

const ProductCreateMedia = graphqlAdmin(`mutation SyncProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
	productCreateMedia(productId: $productId, media: $media) {
		media { id status }
		mediaUserErrors { field message code }
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

		async getFields(type, gid) {
			if (type === 'product') {
				const r = await withRateLimit(() => client.query(ProductFields, { id: gid }).toPromise());
				if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
				const p = r.data?.product;
				if (!p) return null;
				let authorGids: string[] = [];
				try {
					const parsed = p.authors?.value ? JSON.parse(p.authors.value) : [];
					if (Array.isArray(parsed)) authorGids = parsed;
				} catch {
					authorGids = [];
				}
				return {
					title: p.title,
					descriptionHtml: p.descriptionHtml ?? '',
					status: p.status,
					authors: gidList(authorGids)
				};
			}
			if (type === 'variant') {
				const r = await withRateLimit(() => client.query(VariantFields, { id: gid }).toPromise());
				if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
				const v = r.data?.productVariant;
				if (!v) return null;
				return { price: v.price ?? '', sku: v.inventoryItem?.sku ?? '' };
			}
			const r = await withRateLimit(() => client.query(MetaobjectFields, { id: gid }).toPromise());
			if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
			const m = r.data?.metaobject;
			if (!m) return null;
			return metaobjectManagedFieldsFromRemote(m.fields);
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
								...(write.sku != null ? { inventoryItem: { sku: write.sku } } : {}),
								...(write.mediaId ? { mediaId: write.mediaId } : {})
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
		},

		async createProductMedia(productGid, media) {
			if (media.length === 0) return [];
			const r = await withRateLimit(() =>
				client
					.mutation(ProductCreateMedia, {
						productId: productGid,
						media: media.map((m) => ({
							originalSource: m.originalSource,
							alt: m.alt ?? undefined,
							mediaContentType: 'IMAGE' as const
						}))
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.productCreateMedia;
			if (payload?.mediaUserErrors?.length) {
				throw new Error(
					`productCreateMedia userErrors: ${payload.mediaUserErrors.map((e) => e.message).join('; ')}`
				);
			}
			return (payload?.media ?? []).map((m) => m.id);
		}
	};
}
