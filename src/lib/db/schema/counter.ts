import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Named monotonic counters. Used for the gapless receipt-number sequence
 * (Swedish bookkeeping requires unbroken, ordered numbering). Incremented
 * atomically via a single UPDATE … RETURNING.
 */
export const counter = sqliteTable('counter', {
	name: text('name').primaryKey(),
	value: integer('value').notNull().default(0)
});

export type Counter = typeof counter.$inferSelect;
