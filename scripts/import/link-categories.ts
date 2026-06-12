#!/usr/bin/env tsx
/**
 * Link products to categories based on variant metafield "book.category"
 * 
 * This script:
 * 1. Finds all variants with book.category metafield
 * 2. Parses the JSON array of metaobject IDs
 * 3. Links products to the corresponding metaobjects (pages/categories)
 * 
 * Usage:
 *   npm run link-categories
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../src/lib/db/schema';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';

// Create client
const dbClient = createClient({ url: DATABASE_URL });
const db = drizzle(dbClient, { schema });

interface LinkStats {
	productsLinked: number;
	linksCreated: number;
	categoriesNotFound: Set<string>;
	errors: string[];
}

async function linkCategories() {
	console.log('🚀 Starting category linking...\n');

	const stats: LinkStats = {
		productsLinked: 0,
		linksCreated: 0,
		categoriesNotFound: new Set(),
		errors: []
	};

	// Get all metafields with namespace "book" and key "category"
	const categoryMetafields = await db
		.select()
		.from(schema.metafield)
		.where(
			and(eq(schema.metafield.namespace, 'book'), eq(schema.metafield.key, 'category'))
		);

	console.log(`📦 Found ${categoryMetafields.length} products with category metafields\n`);

	// Get all metaobjects for lookup
	const allMetaobjects = await db.select().from(schema.metaobject);
	const metaobjectLookup = new Map(allMetaobjects.map((mo) => [mo.shopifyId, mo]));

	console.log(`📚 ${allMetaobjects.length} categories available for linking\n`);

	// Process each product
	for (const mf of categoryMetafields) {
		try {
			// Get the variant to find the product
			const variant = await db
				.select()
				.from(schema.variant)
				.where(eq(schema.variant.id, mf.ownerId))
				.limit(1);

			if (variant.length === 0) {
				stats.errors.push(`Variant ${mf.ownerId} not found`);
				continue;
			}

			const productId = variant[0].productId;

			// Parse category metafield value (JSON array of metaobject GIDs)
			let categoryIds: string[];
			try {
				categoryIds = JSON.parse(mf.value);
			} catch (e) {
				// If not JSON, try as single value
				categoryIds = [mf.value];
			}

			// Link product to each category in the path
			for (const shopifyMetaobjectId of categoryIds) {
				const metaobject = metaobjectLookup.get(shopifyMetaobjectId);

				if (!metaobject) {
					stats.categoriesNotFound.add(shopifyMetaobjectId);
					continue;
				}

				// Insert link (skip if already exists)
				try {
					await db.insert(schema.productsToMetaobjects).values({
						productId,
						metaobjectId: metaobject.id,
						relationType: 'category',
						position: 0
					});

					stats.linksCreated++;
				} catch (e: any) {
					// Ignore duplicate key errors
					if (!e.message?.includes('UNIQUE constraint failed')) {
						throw e;
					}
				}
			}

			stats.productsLinked++;

			// Get product for logging
			const product = await db
				.select()
				.from(schema.product)
				.where(eq(schema.product.id, productId))
				.limit(1);

			if (product.length > 0) {
				const categories = categoryIds
					.map((id) => metaobjectLookup.get(id)?.title || 'Unknown')
					.join(' > ');
				console.log(`   ✓ ${product[0].title} → ${categories}`);
			}
		} catch (error: any) {
			stats.errors.push(`Metafield ${mf.id}: ${error.message}`);
		}
	}

	// Print summary
	console.log('\n✅ Category linking complete!\n');
	console.log('📊 Statistics:');
	console.log(`   Products linked: ${stats.productsLinked}`);
	console.log(`   Total links created: ${stats.linksCreated}`);

	if (stats.categoriesNotFound.size > 0) {
		console.log(`\n⚠️  Categories not found (${stats.categoriesNotFound.size}):`);
		Array.from(stats.categoriesNotFound)
			.slice(0, 10)
			.forEach((id, i) => console.log(`   ${i + 1}. ${id}`));
		if (stats.categoriesNotFound.size > 10) {
			console.log(`   ... and ${stats.categoriesNotFound.size - 10} more`);
		}
	}

	if (stats.errors.length > 0) {
		console.log(`\n⚠️  Errors (${stats.errors.length}):`);
		stats.errors.slice(0, 10).forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
		if (stats.errors.length > 10) {
			console.log(`   ... and ${stats.errors.length - 10} more`);
		}
	}

	console.log('\n💡 Next steps:\n   1. Verify data in Drizzle Studio: npm run db:studio:local\n   2. Build the admin UI\n   3. Build the storefront');
}

// Run linking
linkCategories()
	.then(() => {
		console.log('\n✅ Done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n❌ Fatal error:', error);
		process.exit(1);
	});
