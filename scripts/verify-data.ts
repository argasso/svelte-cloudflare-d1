#!/usr/bin/env tsx
/**
 * Verify imported data
 * Quick script to check database contents
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';
const dbClient = createClient({ url: DATABASE_URL });
const db = drizzle(dbClient, { schema });

async function verify() {
	console.log('🔍 Verifying imported data...\n');

	// Count records
	const productCount = await db.select({ count: sql<number>`count(*)` }).from(schema.product);
	const variantCount = await db.select({ count: sql<number>`count(*)` }).from(schema.variant);
	const metafieldCount = await db.select({ count: sql<number>`count(*)` }).from(schema.metafield);
	const metaobjectCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.metaobject);
	const linkCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.productsToMetaobjects);

	console.log('📊 Record Counts:');
	console.log(`   Products: ${productCount[0].count}`);
	console.log(`   Variants: ${variantCount[0].count}`);
	console.log(`   Metafields: ${metafieldCount[0].count}`);
	console.log(`   Metaobjects (Pages): ${metaobjectCount[0].count}`);
	console.log(`   Product-Category Links: ${linkCount[0].count}\n`);

	// Show sample products with categories
	console.log('📚 Sample Products with Categories:\n');

	const productsWithCategories = await db
		.select({
			productTitle: schema.product.title,
			categoryTitle: schema.metaobject.title,
			categoryHandle: schema.metaobject.handle
		})
		.from(schema.product)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.product.id, schema.productsToMetaobjects.productId)
		)
		.innerJoin(
			schema.metaobject,
			eq(schema.productsToMetaobjects.metaobjectId, schema.metaobject.id)
		)
		.limit(20);

	productsWithCategories.forEach((row) => {
		console.log(`   • ${row.productTitle}`);
		console.log(`     └─ ${row.categoryTitle} (${row.categoryHandle})`);
	});

	// Show category hierarchy
	console.log('\n🌳 Category Hierarchy:\n');

	const rootCategories = await db
		.select()
		.from(schema.metaobject)
		.where(sql`${schema.metaobject.parentId} IS NULL`)
		.limit(10);

	for (const root of rootCategories) {
		console.log(`📁 ${root.title} (${root.handle})`);

		const children = await db
			.select()
			.from(schema.metaobject)
			.where(eq(schema.metaobject.parentId, root.id));

		for (const child of children) {
			console.log(`   ├─ ${child.title} (${child.handle})`);

			const grandchildren = await db
				.select()
				.from(schema.metaobject)
				.where(eq(schema.metaobject.parentId, child.id));

			for (const grandchild of grandchildren) {
				console.log(`   │  └─ ${grandchild.title} (${grandchild.handle})`);
			}
		}
	}

	console.log('\n✅ Verification complete!');
	console.log('\n💡 Your data is ready for the admin UI and storefront!\n');
}

verify()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('❌ Error:', error);
		process.exit(1);
	});
