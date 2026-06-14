import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

/**
 * Common columns for all tables
 */
export const commonColumns = {
	createdAt: text('created_at')
		.default(sql`(CURRENT_TIMESTAMP)`)
		.notNull(),
	updatedAt: text('updated_at')
		.default(sql`(CURRENT_TIMESTAMP)`)
		.notNull()
};

/**
 * Optimistic-concurrency columns for entities synced to Shopify
 * (product, variant, metaobject). Used to avoid overwriting newer Shopify data:
 * before pushing, we compare Shopify's current updatedAt against
 * `shopifyUpdatedAt` (the version we last saw). They must match to push.
 */
export const syncColumns = {
	/** Shopify's `updatedAt` as of our last successful sync — the base version.
	 *  Null = never synced from Shopify (unknown base; treat conservatively). */
	shopifyUpdatedAt: text('shopify_updated_at'),
	/** When we last successfully pushed to / pulled from Shopify. A row is
	 *  "dirty" (has local edits to push) when `updatedAt` > `lastSyncedAt`. */
	lastSyncedAt: text('last_synced_at'),
	/** Hash of the managed-field values as of last sync (the base snapshot).
	 *  On a timestamp conflict, compared against Shopify's current fields to
	 *  tell a real field change from an unrelated `updatedAt` bump. */
	shopifyFieldHash: text('shopify_field_hash')
};

/**
 * Status enum used across multiple tables
 */
export const statusEnum = ['Draft', 'Active', 'Archived'] as const;
export type Status = (typeof statusEnum)[number];
