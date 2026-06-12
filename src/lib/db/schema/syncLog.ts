import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';

/**
 * Sync log table - tracks all sync operations between D1 and Shopify
 * Used for debugging, monitoring, and conflict resolution
 */
export const syncLog = sqliteTable('sync_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),

	// Entity being synced
	entityType: text('entity_type', {
		enum: ['product', 'variant', 'metafield', 'metaobject', 'media']
	}).notNull(),
	entityId: text('entity_id').notNull(),

	// Sync direction
	direction: text('direction', {
		enum: ['shopify_to_d1', 'd1_to_shopify']
	}).notNull(),

	// Sync result
	status: text('status', {
		enum: ['success', 'failed', 'pending', 'skipped']
	}).notNull(),

	errorMessage: text('error_message'),

	// Optional: store payload for debugging
	payload: text('payload', { mode: 'json' }),

	timestamp: text('timestamp')
		.default(sql`(CURRENT_TIMESTAMP)`)
		.notNull()
});

export const syncLogInsertSchema = createInsertSchema(syncLog);
export const syncLogSelectSchema = createSelectSchema(syncLog);

export type SyncLog = typeof syncLog.$inferSelect;
export type SyncLogInsert = typeof syncLog.$inferInsert;
