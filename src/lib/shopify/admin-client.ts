import { Client, cacheExchange, fetchExchange } from '@urql/core';

const SHOPIFY_SHOP = 'argasso.myshopify.com';
const SHOPIFY_API_VERSION = '2024-10';

/**
 * Shopify Admin API client
 * Used for: Importing data, mutations, admin operations
 * Requires: Admin API access token with appropriate scopes
 */
export function createAdminClient(accessToken: string) {
	return new Client({
		url: `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
		exchanges: [cacheExchange, fetchExchange],
		fetchOptions: {
			headers: {
				'X-Shopify-Access-Token': accessToken,
				'Content-Type': 'application/json'
			}
		}
	});
}

/**
 * Rate limit helper for Shopify API
 * Shopify uses bucket-based throttling
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error: any) {
		// Handle 429 Too Many Requests
		if (error.response?.status === 429) {
			const retryAfter = parseInt(error.response.headers.get('Retry-After') || '2');
			console.log(`Rate limited. Retrying after ${retryAfter}s...`);
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
			return withRateLimit(fn);
		}
		throw error;
	}
}
