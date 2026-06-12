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
 * Status enum used across multiple tables
 */
export const statusEnum = ['Draft', 'Active', 'Archived'] as const;
export type Status = (typeof statusEnum)[number];
