import { Client, cacheExchange, fetchExchange } from '@urql/core';

const SHOPIFY_SHOP = 'argasso.myshopify.com';
const SHOPIFY_API_VERSION = '2024-10';

/**
 * Shopify Storefront API client
 * Used for: Public storefront queries (if needed as fallback)
 * Note: In production, we'll use D1 instead for better performance
 */
export function createStorefrontClient(accessToken: string) {
	return new Client({
		url: `https://${SHOPIFY_SHOP}/api/${SHOPIFY_API_VERSION}/graphql`,
		exchanges: [cacheExchange, fetchExchange],
		fetchOptions: {
			headers: {
				'X-Shopify-Storefront-Access-Token': accessToken,
				'Content-Type': 'application/json'
			}
		}
	});
}
