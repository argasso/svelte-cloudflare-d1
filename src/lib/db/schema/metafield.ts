import { relations } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';
import { product } from './product';
import { variant } from './variant';

/**
 * Metafield table - stores additional metadata for products and variants
 * Polymorphic: can belong to either product or variant
 */
export const metafield = sqliteTable('metafield', {
	id: text('id').primaryKey(), // Shopify GID

	// Polymorphic owner
	ownerId: text('owner_id').notNull(),
	ownerType: text('owner_type', { enum: ['product', 'variant'] }).notNull(),

	// Metafield data
	namespace: text('namespace').notNull(),
	key: text('key').notNull(),

	value: text('value').notNull(),
	type: text('type').notNull(), // Shopify metafield type

	// For complex types (JSON, list, etc.)
	valueJson: text('value_json', { mode: 'json' }),

	...commonColumns
});

export const metafieldRelations = relations(metafield, ({ one }) => ({
	product: one(product, {
		fields: [metafield.ownerId],
		references: [product.id]
	}),
	variant: one(variant, {
		fields: [metafield.ownerId],
		references: [variant.id]
	})
}));

export const metafieldInsertSchema = createInsertSchema(metafield);
export const metafieldSelectSchema = createSelectSchema(metafield);

export type Metafield = typeof metafield.$inferSelect;
export type MetafieldInsert = typeof metafield.$inferInsert;
