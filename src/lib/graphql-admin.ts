import { initGraphQLTada } from 'gql.tada';
import type { introspection } from './graphql-admin-env';

/**
 * Typed gql.tada instance for the Shopify **Admin** API (mutations, sync).
 * The Storefront-API instance is in `./graphql.ts`. Regenerate the schema with
 * `npm run tada:admin-schema` (needs SHOPIFY_ADMIN_ACCESS_TOKEN) and the types
 * with `npm run tada:generate`.
 */
export const graphqlAdmin = initGraphQLTada<{
	introspection: introspection;
	scalars: {
		DateTime: string;
		Decimal: string;
		Money: string;
		URL: string;
		HTML: string;
		JSON: unknown;
		UnsignedInt64: string;
	};
}>();

export type { FragmentOf, ResultOf, VariablesOf } from 'gql.tada';
export { readFragment } from 'gql.tada';
