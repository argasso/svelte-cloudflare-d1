#!/usr/bin/env tsx
/**
 * Import metaobjects (Pages) from Shopify Admin API to D1
 * 
 * This script:
 * 1. Fetches all metaobjects of type "page" from Shopify
 * 2. Stores them in the metaobject table with flexible JSON fields
 * 3. Resolves parent-child relationships for 3-level hierarchy
 * 
 * Usage:
 *   npm run import:pages
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
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

// GraphQL query for metaobjects
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
						reference {
							... on Metaobject {
								id
								handle
							}
						}
						references(first: 20) {
							nodes {
								... on Metaobject {
									id
									handle
								}
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
	metaobjects: number;
	hierarchyResolved: number;
	errors: string[];
}

async function importMetaobjects() {
	console.log('🚀 Starting Shopify metaobject import...\n');

	const stats: ImportStats = {
		metaobjects: 0,
		hierarchyResolved: 0,
		errors: []
	};

	const metaobjectMap = new Map<string, any>();

	let hasNextPage = true;
	let cursor: string | null = null;

	// Step 1: Fetch all metaobjects
	console.log('📦 Fetching metaobjects of type "page"...');

	while (hasNextPage) {
		const result = await withRateLimit(async () =>
			adminClient.query(GetMetaobjectsQuery, { type: 'page', first: 250, after: cursor })
		);

		if (result.error) {
			console.error('❌ GraphQL Error:', result.error);
			stats.errors.push(result.error.message);
			break;
		}

		const metaobjects = result.data?.metaobjects.edges || [];
		console.log(`   Found ${metaobjects.length} metaobjects`);

		for (const edge of metaobjects) {
			const shopifyMo = edge.node;
			metaobjectMap.set(shopifyMo.id, shopifyMo);
		}

		hasNextPage = result.data?.metaobjects.pageInfo.hasNextPage || false;
		cursor = result.data?.metaobjects.pageInfo.endCursor || null;
	}

	console.log(`\n✅ Fetched ${metaobjectMap.size} metaobjects total\n`);

	// Step 2: Insert all metaobjects (without parent relationships first)
	console.log('💾 Inserting metaobjects into D1...');

	for (const [id, shopifyMo] of metaobjectMap) {
		try {
			// Parse fields into JSON object
			const fields: any = {};
			for (const field of shopifyMo.fields) {
				if (field.references?.nodes && field.references.nodes.length > 0) {
					// Store array of reference IDs
					fields[field.key] = field.references.nodes.map((n: any) => n.id);
				} else if (field.reference) {
					// Store single reference ID
					fields[field.key] = field.reference.id;
				} else {
					// Store value
					fields[field.key] = field.value;
				}
			}

			// Extract title for denormalization
			const title = fields.title || fields.name || shopifyMo.handle;

			// Insert metaobject
			await dbClient.execute({
				sql: `INSERT INTO metaobject (shopify_id, handle, type, fields, title, status, created_at, updated_at)
					  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					  ON CONFLICT(shopify_id) DO UPDATE SET
						  handle = excluded.handle,
						  fields = excluded.fields,
						  title = excluded.title,
						  updated_at = excluded.updated_at`,
				args: [
					shopifyMo.id,
					shopifyMo.handle,
					shopifyMo.type,
					JSON.stringify(fields),
					title,
					'Active',
					shopifyMo.updatedAt,
					shopifyMo.updatedAt
				]
			});

			stats.metaobjects++;
			console.log(`   ✓ ${title} (${shopifyMo.handle})`);
		} catch (error: any) {
			console.error(`   ❌ Error importing ${shopifyMo.handle}:`, error.message);
			stats.errors.push(`${shopifyMo.handle}: ${error.message}`);
		}
	}

	// Step 3: Resolve parent-child relationships
	console.log('\n🔗 Resolving hierarchy...');

	// Get all inserted metaobjects from D1
	const allMetaobjects = await db.select().from(schema.metaobject);

	for (const mo of allMetaobjects) {
		try {
			const fields = mo.fields as any;

			// Find parent by checking if this metaobject's ID is in another's sub_pages
			const parent = allMetaobjects.find((p) => {
				const pFields = p.fields as any;
				return (
					pFields?.sub_pages &&
					Array.isArray(pFields.sub_pages) &&
					pFields.sub_pages.includes(mo.shopifyId)
				);
			});

			if (parent) {
				await db
					.update(schema.metaobject)
					.set({ parentId: parent.id })
					.where(eq(schema.metaobject.id, mo.id));

				stats.hierarchyResolved++;
			}
		} catch (error: any) {
			console.error(`   ❌ Error resolving hierarchy for ${mo.handle}:`, error.message);
		}
	}

	console.log(`   ✓ Resolved ${stats.hierarchyResolved} parent-child relationships`);

	// Print summary
	console.log('\n✅ Import complete!\n');
	console.log('📊 Statistics:');
	console.log(`   Metaobjects imported: ${stats.metaobjects}`);
	console.log(`   Hierarchy links: ${stats.hierarchyResolved}`);

	if (stats.errors.length > 0) {
		console.log(`\n⚠️  Errors (${stats.errors.length}):`);
		stats.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
	}

	console.log(
		'\n💡 Next step:\n' + '   Run the category linking script to connect products to pages\n'
	);
}

// Run import
importMetaobjects()
	.then(() => {
		console.log('\n✅ Done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n❌ Fatal error:', error);
		process.exit(1);
	});
