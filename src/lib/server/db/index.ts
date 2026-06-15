import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';

import * as schema from '$lib/db/schema';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';

/**
 * Create a Drizzle client for Cloudflare D1 (production/preview).
 */
export function createD1Database(d1: D1Database) {
	return drizzleD1(d1, { schema });
}

/**
 * Create a Drizzle client for LibSQL (local development only).
 *
 * `@libsql/client` is a Node library that doesn't run on Cloudflare Workers, so
 * it's imported dynamically here — that keeps it out of the deployed worker
 * bundle (the deployed app only ever uses the D1 path).
 */
export async function createLibSQLDatabase(url: string) {
	const { drizzle: drizzleLibSQL } = await import('drizzle-orm/libsql');
	const { createClient } = await import('@libsql/client');
	return drizzleLibSQL(createClient({ url }), { schema });
}

/**
 * Type for database instance
 */
export type DbClient = BaseSQLiteDatabase<
	'async' | 'sync',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	any,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;
