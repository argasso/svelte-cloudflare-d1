#!/usr/bin/env tsx
/**
 * Import products from Shopify Admin API into the local D1 (via libSQL).
 *
 * Delegates to the shared `importProductPage` + `linkProducts` in
 * `src/lib/server/import/index.ts`, which is also used by the admin sync UI —
 * so the CLI and the in-app path stay in lock-step (variant media, resolve of
 * variant.image_shopify_id → image_id, book.category → product links, etc.).
 *
 * Usage: `npm run import:products`
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import dotenv from 'dotenv';
import path from 'path';
import * as schema from '../../src/lib/db/schema';
import { importProductPage, linkProducts } from '../../src/lib/server/import';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';

if (!TOKEN) {
	console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN not set');
	process.exit(1);
}

const dbClient = createClient({ url: DATABASE_URL });
const db = drizzle(dbClient, { schema });

async function main() {
	console.log('🚀 Importing products from Shopify...\n');

	let cursor: string | null = null;
	let page = 0;
	let totalImported = 0;
	let totalSkipped = 0;
	do {
		page++;
		process.stdout.write(`📦 Page ${page}${cursor ? ` (…${cursor.slice(-8)})` : ''} … `);
		const r = await importProductPage(TOKEN, db, cursor);
		console.log(`imported ${r.imported}, skipped ${r.skipped}`);
		totalImported += r.imported;
		totalSkipped += r.skipped;
		cursor = r.nextCursor;
	} while (cursor);

	console.log('\n🔗 Rebuilding product ↔ category links…');
	let afterId: number | null = 0;
	let totalLinked = 0;
	while (afterId !== null) {
		const r = await linkProducts(db, afterId);
		totalLinked += r.linked;
		afterId = r.nextCursor;
	}

	console.log('\n✅ Import complete');
	console.log(`   Products imported:            ${totalImported}`);
	console.log(`   Products skipped (dirty):     ${totalSkipped}`);
	console.log(`   Product↔category links built: ${totalLinked}`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('\n❌ Fatal error:', err);
		process.exit(1);
	});
