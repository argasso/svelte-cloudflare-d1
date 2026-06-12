import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibSQL } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import type { D1Database } from '@cloudflare/workers-types';

import * as schema from '$lib/db/schema';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';

/**
 * Create a Drizzle client for Cloudflare D1 (production/preview)
 */
export function createD1Database(d1: D1Database) {
	return drizzleD1(d1, { schema });
}

/**
 * Create a Drizzle client for LibSQL (local development)
 */
export function createLibSQLDatabase(url: string) {
	const client = createClient({ url });
	return drizzleLibSQL(client, { schema });
}

/**
 * Type for database instance
 */
// export type Database = ReturnType<typeof createD1Database> // | typeof createLibSQLDatabase>;

export type DbClient = BaseSQLiteDatabase<
  'async' | 'sync', 
  any, 
  typeof schema, 
  ExtractTablesWithRelations<typeof schema>
>;