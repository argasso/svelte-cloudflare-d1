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
	normalizePrice,
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
	/** Search engine listing; null clears the override (Shopify falls back to title/desc). */
	seoTitle?: string | null;
	seoDescription?: string | null;
}

export interface VariantWrite {
	/** Variant gid */
	id: string;
	price: string;
	sku?: string | null;
	/** ISBN / EAN, stored on Shopify's barcode field */
	barcode?: string | null;
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
	/**
	 * Create a new product on Shopify. Shopify creates a default variant
	 * alongside; both gids come back so the caller can persist them locally.
	 */
	createProduct(input: {
		title: string;
		status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
	}): Promise<{ productGid: string; variantGid: string; updatedAt: string }>;
	/** Push variant price/sku via productVariantsBulkUpdate */
	updateVariant(productGid: string, write: VariantWrite): Promise<void>;
	/**
	 * Create a new variant on a product. Uses the product's first option name
	 * (typically "Title" or "Format" for Argasso books) so the caller doesn't
	 * have to know the option shape. Returns the variant's gid + updatedAt.
	 */
	createVariant(
		productGid: string,
		input: { title: string; price: number }
	): Promise<{ variantGid: string; updatedAt: string }>;
	/** Delete a variant from a product. */
	deleteVariant(productGid: string, variantGid: string): Promise<{ updatedAt: string }>;
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
	/** Current MediaImage gids attached to a product, in Shopify's order. */
	getProductMediaIds(productGid: string): Promise<string[]>;
	/** Reorder a product's media to match the given gid order. */
	reorderProductMedia(productGid: string, orderedMediaIds: string[]): Promise<void>;
	/**
	 * Delete files (any File: product MediaImage, author image, …). General,
	 * non-deprecated removal — deleting a file detaches it from its product and
	 * clears variant associations automatically.
	 */
	deleteFiles(fileIds: string[]): Promise<void>;
	/**
	 * Create Shopify files from public image URLs (e.g. an author image, which is
	 * a file reference on the metaobject). Returns the file gids in input order.
	 */
	createFiles(files: { originalSource: string; alt?: string | null }[]): Promise<string[]>;
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

// productCreate returns the newly created product AND its auto-generated default
// variant, so we don't need a second call to fetch the variant gid.
const ProductCreate = graphqlAdmin(`mutation SyncProductCreate($product: ProductCreateInput!) {
	productCreate(product: $product) {
		product { id updatedAt variants(first: 1) { nodes { id } } }
		userErrors { field message }
	}
}`);

const VariantsBulkUpdate = graphqlAdmin(`mutation SyncVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
	productVariantsBulkUpdate(productId: $productId, variants: $variants) {
		productVariants { id updatedAt }
		userErrors { field message }
	}
}`);

// productVariantsBulkCreate needs each variant's option value, keyed by the
// product's option name (typically "Title" for single-option products or
// "Format" for multi-format books). We look up that name below.
const VariantsBulkCreate = graphqlAdmin(`mutation SyncVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
	productVariantsBulkCreate(productId: $productId, variants: $variants) {
		productVariants { id }
		product { id updatedAt }
		userErrors { field message }
	}
}`);

const VariantsBulkDelete = graphqlAdmin(`mutation SyncVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
	productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
		product { id updatedAt }
		userErrors { field message }
	}
}`);

// Read the product's first option name so createVariant can build a valid
// optionValues array without hard-coding "Title".
const ProductFirstOption = graphqlAdmin(`query SyncProductFirstOption($id: ID!) {
	product(id: $id) { options(first: 1) { name } }
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

const ProductMediaIds = graphqlAdmin(`query SyncProductMediaIds($id: ID!) {
	product(id: $id) { media(first: 100) { nodes { id } } }
}`);

const ProductReorderMedia = graphqlAdmin(`mutation SyncProductReorderMedia($id: ID!, $moves: [MoveInput!]!) {
	productReorderMedia(id: $id, moves: $moves) {
		userErrors { field message }
	}
}`);

const FileDelete = graphqlAdmin(`mutation SyncFileDelete($fileIds: [ID!]!) {
	fileDelete(fileIds: $fileIds) {
		deletedFileIds
		userErrors { field message code }
	}
}`);

const FileCreate = graphqlAdmin(`mutation SyncFileCreate($files: [FileCreateInput!]!) {
	fileCreate(files: $files) {
		files { id }
		userErrors { field message code }
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
				return { price: normalizePrice(v.price), sku: v.inventoryItem?.sku ?? '' };
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
							status: write.status,
							seo: { title: write.seoTitle ?? null, description: write.seoDescription ?? null }
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

		async createProduct({ title, status }) {
			const r = await withRateLimit(() =>
				client.mutation(ProductCreate, { product: { title, status } }).toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.productCreate;
			if (payload?.userErrors?.length) {
				throw new Error(
					`productCreate userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`
				);
			}
			const productGid = payload?.product?.id;
			const updatedAt = payload?.product?.updatedAt;
			const variantGid = payload?.product?.variants?.nodes?.[0]?.id;
			if (!productGid || !updatedAt || !variantGid) {
				throw new Error('productCreate returned an incomplete response');
			}
			return { productGid, variantGid, updatedAt };
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
								...(write.barcode != null ? { barcode: write.barcode } : {}),
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

		async createVariant(productGid, { title, price }) {
			// Look up the product's first option name so the optionValues payload
			// matches (books usually have "Title" for single-variant products and
			// "Format" for multi-format ones).
			const q = await withRateLimit(() =>
				client.query(ProductFirstOption, { id: productGid }).toPromise()
			);
			if (q.error) throw new Error(`Shopify read failed: ${q.error.message}`);
			const optionName = q.data?.product?.options?.[0]?.name;
			if (!optionName) throw new Error('Could not read product option name from Shopify');

			const r = await withRateLimit(() =>
				client
					.mutation(VariantsBulkCreate, {
						productId: productGid,
						variants: [
							{
								price: price.toFixed(2),
								optionValues: [{ optionName, name: title }]
							}
						]
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.productVariantsBulkCreate;
			if (payload?.userErrors?.length) {
				throw new Error(
					`productVariantsBulkCreate userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`
				);
			}
			const variantGid = payload?.productVariants?.[0]?.id;
			const updatedAt = payload?.product?.updatedAt;
			if (!variantGid || !updatedAt) throw new Error('productVariantsBulkCreate returned an incomplete response');
			return { variantGid, updatedAt };
		},

		async deleteVariant(productGid, variantGid) {
			const r = await withRateLimit(() =>
				client
					.mutation(VariantsBulkDelete, { productId: productGid, variantsIds: [variantGid] })
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.productVariantsBulkDelete;
			if (payload?.userErrors?.length) {
				throw new Error(
					`productVariantsBulkDelete userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`
				);
			}
			const updatedAt = payload?.product?.updatedAt;
			if (!updatedAt) throw new Error('productVariantsBulkDelete returned no updatedAt');
			return { updatedAt };
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
		},

		async getProductMediaIds(productGid) {
			const r = await withRateLimit(() =>
				client.query(ProductMediaIds, { id: productGid }).toPromise()
			);
			if (r.error) throw new Error(`Shopify read failed: ${r.error.message}`);
			return (r.data?.product?.media?.nodes ?? []).map((n) => n.id);
		},

		async reorderProductMedia(productGid, orderedMediaIds) {
			if (orderedMediaIds.length === 0) return;
			const moves = orderedMediaIds.map((id, i) => ({ id, newPosition: String(i) }));
			const r = await withRateLimit(() =>
				client.mutation(ProductReorderMedia, { id: productGid, moves }).toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const errs = r.data?.productReorderMedia?.userErrors;
			if (errs?.length) {
				throw new Error(`productReorderMedia userErrors: ${errs.map((e) => e.message).join('; ')}`);
			}
		},

		async deleteFiles(fileIds) {
			if (fileIds.length === 0) return;
			const r = await withRateLimit(() => client.mutation(FileDelete, { fileIds }).toPromise());
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const errs = r.data?.fileDelete?.userErrors;
			if (errs?.length) {
				throw new Error(`fileDelete userErrors: ${errs.map((e) => e.message).join('; ')}`);
			}
		},

		async createFiles(files) {
			if (files.length === 0) return [];
			const r = await withRateLimit(() =>
				client
					.mutation(FileCreate, {
						files: files.map((f) => ({
							originalSource: f.originalSource,
							alt: f.alt ?? undefined,
							contentType: 'IMAGE' as const
						}))
					})
					.toPromise()
			);
			if (r.error) throw new Error(`Shopify write failed: ${r.error.message}`);
			const payload = r.data?.fileCreate;
			if (payload?.userErrors?.length) {
				throw new Error(`fileCreate userErrors: ${payload.userErrors.map((e) => e.message).join('; ')}`);
			}
			return (payload?.files ?? []).map((f) => f.id);
		}
	};
}
