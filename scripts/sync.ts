#!/usr/bin/env tsx
/**
 * D1 -> Shopify sync CLI.
 *
 * Default is a DRY RUN against production: it reads each dirty row's current
 * Shopify updatedAt (read-only) and prints what sync would do. Nothing is
 * mutated unless you pass BOTH --apply and --yes.
 *
 * Usage:
 *   npm run sync                              # dry-run plan, all dirty rows
 *   npm run sync -- --type=metaobject --id=30 # dry-run, one record
 *   npm run sync -- --apply --yes --type=metaobject --id=30  # push one record
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/db/schema';
import { applySync, planSync, rebaseFieldHashes, createShopifyGateway, type SyncFilter } from '../src/lib/server/sync';
import type { SyncEntityType } from '../src/lib/server/sync/gateway';
import type { DbClient } from '../src/lib/server/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';

if (!TOKEN) {
	console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN not set');
	process.exit(1);
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has('--apply');
const confirmed = args.has('--yes');
const getOpt = (name: string) => argv.find((a) => a.startsWith(name + '='))?.split('=')[1];
const filter: SyncFilter = {
	type: getOpt('--type') as SyncEntityType | undefined,
	id: getOpt('--id')
};

const db = drizzle(createClient({ url: DATABASE_URL }), { schema }) as unknown as DbClient;
const gateway = createShopifyGateway(TOKEN);

async function main() {
	if (apply && !confirmed) {
		console.error('Refusing to --apply without --yes (this writes to the PRODUCTION Shopify store).');
		process.exit(1);
	}

	if (args.has('--rebase')) {
		console.log('Rebasing field hashes from current local state…');
		const counts = await rebaseFieldHashes(db);
		console.log('Done:', counts);
		return;
	}

	if (filter.type || filter.id) console.log('Filter:', filter, '\n');

	if (!apply) {
		console.log('DRY RUN (read-only). Pass --apply --yes to push.\n');
		const plan = await planSync(db, gateway, filter);
		summarize(plan.map((p) => ({ ...p, applied: false })));
		return;
	}

	console.log('APPLYING to production Shopify…\n');
	const results = await applySync(db, gateway, { apply: true, filter });
	summarize(results);
}

function summarize(results: { type: string; title: string | null; decision: { action: string }; applied: boolean; error?: string }[]) {
	if (results.length === 0) {
		console.log('Nothing to sync — no dirty rows.');
		return;
	}
	const counts: Record<string, number> = {};
	for (const r of results) {
		const key = r.applied ? 'pushed' : r.decision.action;
		counts[key] = (counts[key] ?? 0) + 1;
		const mark = r.applied ? '✓ pushed' : r.decision.action;
		console.log(`  [${r.type}] ${r.title ?? ''} → ${mark}${r.error ? '  (' + r.error + ')' : ''}`);
	}
	console.log('\nSummary:', counts);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
