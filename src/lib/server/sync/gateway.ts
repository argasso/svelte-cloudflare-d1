/**
 * Shopify Admin API gateway for sync.
 *
 * NOTE on typing: the project's gql.tada schema (schema.graphql) is the
 * Storefront API, but pushes need Admin API operations. Until the Admin schema
 * is added for typed operations, these are explicit GraphQL strings with result
 * types asserted locally. Reads are low-risk; writes go through `decideSync`
 * upstream and are only called on an explicit apply.
 */
import { gql, type Client } from '@urql/core';
import { createAdminClient, withRateLimit } from '$lib/shopify/admin-client';

export type SyncEntityType = 'product' | 'variant' | 'metaobject';

export interface MetaobjectWrite {
	handle?: string;
	/** Shopify metaobject status; we map Archived -> DRAFT */
	status?: 'ACTIVE' | 'DRAFT';
	/** Field values as Shopify expects: array of { key, value:string } */
	fields: { key: string; value: string }[];
}

export interface ShopifyGateway {
	/** Read the current Shopify `updatedAt` for an entity (null if not found) */
	getUpdatedAt(type: SyncEntityType, gid: string): Promise<string | null>;
	/** Push a metaobject; returns the new updatedAt on success */
	updateMetaobject(gid: string, write: MetaobjectWrite): Promise<{ updatedAt: string }>;
}

const UPDATED_AT_QUERIES: Record<SyncEntityType, string> = {
	product: `query($id: ID!) { product(id: $id) { id updatedAt } }`,
	variant: `query($id: ID!) { productVariant(id: $id) { id updatedAt } }`,
	metaobject: `query($id: ID!) { metaobject(id: $id) { id updatedAt } }`
};

const METAOBJECT_UPDATE = gql`
	mutation SyncMetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
		metaobjectUpdate(id: $id, metaobject: $metaobject) {
			metaobject {
				id
				updatedAt
			}
			userErrors {
				field
				message
				code
			}
		}
	}
`;

export function createShopifyGateway(accessToken: string): ShopifyGateway {
	const client: Client = createAdminClient(accessToken);

	return {
		async getUpdatedAt(type, gid) {
			const result = await withRateLimit(() =>
				client.query(gql([UPDATED_AT_QUERIES[type]] as never), { id: gid }).toPromise()
			);
			if (result.error) throw new Error(`Shopify read failed: ${result.error.message}`);
			const node = (result.data as Record<string, { updatedAt?: string } | null> | undefined)?.[
				type === 'variant' ? 'productVariant' : type
			];
			return node?.updatedAt ?? null;
		},

		async updateMetaobject(gid, write) {
			const result = await withRateLimit(() =>
				client
					.mutation(METAOBJECT_UPDATE, {
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
			if (result.error) throw new Error(`Shopify write failed: ${result.error.message}`);
			const payload = result.data?.metaobjectUpdate;
			if (payload?.userErrors?.length) {
				throw new Error(
					`metaobjectUpdate userErrors: ${payload.userErrors
						.map((e: { message: string }) => e.message)
						.join('; ')}`
				);
			}
			const updatedAt = payload?.metaobject?.updatedAt;
			if (!updatedAt) throw new Error('metaobjectUpdate returned no updatedAt');
			return { updatedAt };
		}
	};
}
