#!/usr/bin/env tsx
/**
 * Import products from Shopify Admin API to D1
 * 
 * This script:
 * 1. Fetches all products from Shopify (paginated)
 * 2. Extracts variants and metafields
 * 3. Determines categories from variant metafield "book.category"
 * 4. Inserts into D1 database
 * 
 * Usage:
 *   npm run import:products
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, sql } from 'drizzle-orm';
import { createAdminClient, withRateLimit } from '../../src/lib/shopify/admin-client';
import { graphql } from '../../src/lib/graphql';
import * as schema from '../../src/lib/db/schema';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';

if (!SHOPIFY_ADMIN_ACCESS_TOKEN) {
	console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN not set');
	process.exit(1);
}

// Create clients
const adminClient = createAdminClient(SHOPIFY_ADMIN_ACCESS_TOKEN);
const dbClient = createClient({ url: DATABASE_URL });
const db = drizzle(dbClient, { schema });

// GraphQL query for products with variants and metafields
const GetProductsQuery = graphql(`
	query GetProducts($first: Int!, $after: String) {
		products(first: $first, after: $after) {
			edges {
				cursor
				node {
					id
					title
					description
					descriptionHtml
					handle
					status
					createdAt
					updatedAt
					variants(first: 100) {
						edges {
							node {
								id
								title
								sku
								barcode
								price
								compareAtPrice
								inventoryQuantity
								inventoryItem {
									id
								}
								metafields(first: 10) {
									edges {
										node {
											id
											namespace
											key
											value
											type
										}
									}
								}
							}
						}
					}
					metafields(first: 20) {
						edges {
							node {
								id
								namespace
								key
								value
								type
							}
						}
					}
					images(first: 10) {
						edges {
							node {
								id
								url
								altText
								width
								height
							}
						}
					}
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`);

interface ImportStats {
	products: number;
	variants: number;
	metafields: number;
	categories: Set<string>;
	errors: string[];
}

async function importProducts() {
	console.log('🚀 Starting Shopify product import...\n');

	const stats: ImportStats = {
		products: 0,
		variants: 0,
		metafields: 0,
		categories: new Set(),
		errors: []
	};

	let hasNextPage = true;
	let cursor: string | null = null;

	while (hasNextPage) {
		console.log(`📦 Fetching products${cursor ? ` (cursor: ${cursor.slice(0, 20)}...)` : ''}...`);

		const result = await withRateLimit(async () =>
			adminClient.query(GetProductsQuery, { first: 50, after: cursor })
		);

		if (result.error) {
			console.error('❌ GraphQL Error:', result.error);
			stats.errors.push(result.error.message);
			break;
		}

		const products = result.data?.products.edges || [];
		console.log(`   Found ${products.length} products`);

		for (const edge of products) {
			const shopifyProduct = edge.node;

			try {
				// Extract product data (only include fields with values)
				const productData = {
					shopifyId: extractNumericId(shopifyProduct.id),
					title: shopifyProduct.title,
					description: shopifyProduct.descriptionHtml || shopifyProduct.description,
					status: (shopifyProduct.status === 'ACTIVE' ? 'Active' : 'Draft') as 'Active' | 'Draft',
					priceCurrency: 'SEK' as const,
					createdAt: shopifyProduct.createdAt,
					updatedAt: shopifyProduct.updatedAt
				};

				// Use libsql client directly for insert
				let insertedProduct;
				const insertResult = await dbClient.execute({
					sql: `INSERT INTO product (shopify_id, title, description, status, price_currency, created_at, updated_at, shopify_updated_at, last_synced_at)
						  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
						  ON CONFLICT(shopify_id) DO UPDATE SET
							  title = excluded.title,
							  description = excluded.description,
							  status = excluded.status,
							  updated_at = excluded.updated_at,
							  shopify_updated_at = excluded.shopify_updated_at,
							  last_synced_at = excluded.last_synced_at`,
					args: [
						productData.shopifyId,
						productData.title,
						productData.description || '',
						productData.status,
						productData.priceCurrency,
						productData.createdAt,
						productData.updatedAt,
						productData.updatedAt,
						productData.updatedAt
					]
				});
				
				// Get the inserted/updated product
				const selectResult = await dbClient.execute({
					sql: 'SELECT * FROM product WHERE shopify_id = ?',
					args: [productData.shopifyId]
				});
				insertedProduct = selectResult.rows[0] as any;

				stats.products++;
				console.log(`   ✓ Product: ${insertedProduct.title} (${insertedProduct.id})`);

				// Import variants
				for (const variantEdge of shopifyProduct.variants.edges) {
					const shopifyVariant = variantEdge.node;

					const variantData = {
						id: shopifyVariant.id,
						productId: insertedProduct.id,
						title: shopifyVariant.title,
						sku: shopifyVariant.sku,
						barcode: shopifyVariant.barcode,
						price: parseFloat(shopifyVariant.price),
						compareAtPrice: shopifyVariant.compareAtPrice
							? parseFloat(shopifyVariant.compareAtPrice)
							: null,
						inventoryQuantity: shopifyVariant.inventoryQuantity || 0,
						inventoryItemId: shopifyVariant.inventoryItem?.id,
						requiresShipping: true, // Default value
						taxable: true, // Default value
						weight: null,
						weightUnit: null
					};

					// Insert variant
					try {
						await db.insert(schema.variant).values(variantData);
					} catch (e: any) {
						if (e.message?.includes('UNIQUE constraint failed')) {
							await db
								.update(schema.variant)
								.set(variantData)
								.where(eq(schema.variant.id, variantData.id));
						} else {
							throw e;
						}
					}

					stats.variants++;

					// Import variant metafields (including book.category)
					for (const metafieldEdge of shopifyVariant.metafields.edges) {
						const mf = metafieldEdge.node;

						// Track category metafield
						if (mf.namespace === 'book' && mf.key === 'category') {
							stats.categories.add(mf.value);
							console.log(`     → Category: ${mf.value}`);
						}

						const metafieldData = {
							id: mf.id,
							ownerId: shopifyVariant.id,
							ownerType: 'variant' as const,
							namespace: mf.namespace,
							key: mf.key,
							value: mf.value,
							type: mf.type
						};

						// Insert metafield
						try {
							await db.insert(schema.metafield).values(metafieldData);
						} catch (e: any) {
							if (e.message?.includes('UNIQUE constraint failed')) {
								await db
									.update(schema.metafield)
									.set(metafieldData)
									.where(eq(schema.metafield.id, mf.id));
							} else {
								throw e;
							}
						}

						stats.metafields++;
					}
				}

				// Import product-level metafields
				for (const metafieldEdge of shopifyProduct.metafields.edges) {
					const mf = metafieldEdge.node;

					const metafieldData = {
						id: mf.id,
						ownerId: shopifyProduct.id,
						ownerType: 'product' as const,
						namespace: mf.namespace,
						key: mf.key,
						value: mf.value,
						type: mf.type
					};

					// Insert product metafield
					try {
						await db.insert(schema.metafield).values(metafieldData);
					} catch (e: any) {
						if (e.message?.includes('UNIQUE constraint failed')) {
							await db
								.update(schema.metafield)
								.set(metafieldData)
								.where(eq(schema.metafield.id, mf.id));
						} else {
							throw e;
						}
					}

					stats.metafields++;
				}

				// TODO: Import images to media table
			} catch (error: any) {
				console.error(`   ❌ Error importing ${shopifyProduct.title}:`, error.message);
				stats.errors.push(`${shopifyProduct.title}: ${error.message}`);
			}
		}

		// Check pagination
		hasNextPage = result.data?.products.pageInfo.hasNextPage || false;
		cursor = result.data?.products.pageInfo.endCursor || null;

		console.log(`   Processed ${stats.products} products so far...\n`);
	}

	// Print summary
	console.log('\n✅ Import complete!\n');
	console.log('📊 Statistics:');
	console.log(`   Products: ${stats.products}`);
	console.log(`   Variants: ${stats.variants}`);
	console.log(`   Metafields: ${stats.metafields}`);
	console.log(`   Categories found: ${stats.categories.size}`);
	console.log(`   Categories: ${Array.from(stats.categories).join(', ')}`);

	if (stats.errors.length > 0) {
		console.log(`\n⚠️  Errors (${stats.errors.length}):`);
		stats.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
	}

	console.log(
		'\n💡 Next steps:\n' +
			'   1. Run import:pages to import category pages\n' +
			'   2. Link products to categories based on book.category metafield\n'
	);
}

/**
 * Extract numeric ID from Shopify GID
 * "gid://shopify/Product/123" -> "123"
 */
function extractNumericId(gid: string): string {
	return gid.split('/').pop()!;
}

// Run import
importProducts()
	.then(() => {
		console.log('\n✅ Done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n❌ Fatal error:', error);
		process.exit(1);
	});
