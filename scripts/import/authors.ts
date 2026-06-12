#!/usr/bin/env tsx
/**
 * Import Author metaobjects from Shopify Admin API to D1
 * Then link products to authors based on product metafields
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, sql } from 'drizzle-orm';
import { createAdminClient, withRateLimit } from '../../src/lib/shopify/admin-client';
import { graphql } from '../../src/lib/graphql';
import * as schema from '../../src/lib/db/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';

if (!SHOPIFY_ADMIN_ACCESS_TOKEN) {
	console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN not set');
	process.exit(1);
}

const adminClient = createAdminClient(SHOPIFY_ADMIN_ACCESS_TOKEN);
const dbClient = createClient({ url: DATABASE_URL });
const db = drizzle(dbClient, { schema });

const GetMetaobjectsQuery = graphql(`
	query GetMetaobjects($type: String!, $first: Int!, $after: String) {
		metaobjects(type: $type, first: $first, after: $after) {
			edges {
				cursor
				node {
					id
					handle
					type
					updatedAt
					fields {
						key
						value
						type
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

async function importAuthors() {
	console.log('🚀 Starting Author import...\n');

	let authorsImported = 0;
	let hasNextPage = true;
	let cursor: string | null = null;

	// Step 1: Fetch and import authors
	console.log('📦 Fetching Author metaobjects...');

	while (hasNextPage) {
		const result = await withRateLimit(async () =>
			adminClient.query(GetMetaobjectsQuery, { type: 'author', first: 250, after: cursor })
		);

		if (result.error) {
			console.error('❌ GraphQL Error:', result.error);
			break;
		}

		const metaobjects = result.data?.metaobjects.edges || [];
		console.log(`   Found ${metaobjects.length} authors`);

		for (const edge of metaobjects) {
			const shopifyAuthor = edge.node;

			// Parse fields into JSON object
			const fields: any = {};
			for (const field of shopifyAuthor.fields) {
				fields[field.key] = field.value;
			}

			// Extract common fields
			const fullName = fields.full_name || fields.name || shopifyAuthor.handle;
			const bio = fields.bio || fields.description || '';

			await dbClient.execute({
				sql: `INSERT INTO metaobject (shopify_id, handle, type, fields, title, status, created_at, updated_at)
					  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					  ON CONFLICT(shopify_id) DO UPDATE SET
						  handle = excluded.handle,
						  fields = excluded.fields,
						  title = excluded.title,
						  updated_at = excluded.updated_at`,
				args: [
					shopifyAuthor.id,
					shopifyAuthor.handle,
					'author',
					JSON.stringify(fields),
					fullName,
					'Active',
					shopifyAuthor.updatedAt,
					shopifyAuthor.updatedAt
				]
			});

			authorsImported++;
			console.log(`   ✓ ${fullName} (${shopifyAuthor.handle})`);
		}

		hasNextPage = result.data?.metaobjects.pageInfo.hasNextPage || false;
		cursor = result.data?.metaobjects.pageInfo.endCursor || null;
	}

	console.log(`\n✅ Imported ${authorsImported} authors\n`);

	// Step 2: Link products to authors
	console.log('🔗 Linking products to authors...');

	// Get all product metafields with namespace "custom" and key "authors"
	const authorMetafields = await db
		.select()
		.from(schema.metafield)
		.where(
			sql`${schema.metafield.ownerType} = 'product' 
        AND ${schema.metafield.namespace} = 'custom' 
        AND ${schema.metafield.key} = 'authors'`
		);

	console.log(`   Found ${authorMetafields.length} products with author metafields`);

	const allAuthors = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'author'));
	const authorLookup = new Map(allAuthors.map((a) => [a.shopifyId, a]));

	let linksCreated = 0;

	for (const mf of authorMetafields) {
		try {
			// Parse author reference(s) - should be JSON array
			let authorIds: string[];
			try {
				const parsed = JSON.parse(mf.value);
				authorIds = Array.isArray(parsed) ? parsed : [];
			} catch {
				console.warn(`   ⚠️  Failed to parse authors for product ${mf.ownerId}`);
				continue;
			}

			// Skip empty arrays
			if (authorIds.length === 0) continue;

			// Extract numeric ID from GID: "gid://shopify/Product/123" -> "123"
			const numericId = mf.ownerId.split('/').pop();

			// Find product by numeric shopify_id
			const products = await db
				.select()
				.from(schema.product)
				.where(eq(schema.product.shopifyId, numericId!))
				.limit(1);

			if (products.length === 0) {
				console.warn(`   ⚠️  Product not found for Shopify ID: ${numericId}`);
				continue;
			}

			const product = products[0];

			for (const authorShopifyId of authorIds) {
				const author = authorLookup.get(authorShopifyId);
				if (!author) {
					console.warn(`   ⚠️  Author not found: ${authorShopifyId}`);
					continue;
				}

				try {
					await db.insert(schema.productsToMetaobjects).values({
						productId: product.id,
						metaobjectId: author.id,
						relationType: 'author',
						position: 0
					});
					linksCreated++;
				} catch (e: any) {
					if (!e.message?.includes('UNIQUE constraint failed')) {
						throw e;
					}
				}
			}
		} catch (error: any) {
			console.error(`   ❌ Error linking product ${mf.ownerId}:`, error.message);
		}
	}

	console.log(`   ✓ Created ${linksCreated} product-author links`);

	console.log('\n✅ Author import complete!\n');
	console.log('💡 Next: View authors in admin or update product pages to show authors');
}

importAuthors()
	.then(() => {
		console.log('\n✅ Done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n❌ Fatal error:', error);
		process.exit(1);
	});
