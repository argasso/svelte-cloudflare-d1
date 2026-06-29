import { sql, relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import * as v from 'valibot';
import { commonColumns, statusEnum, syncColumns } from '../utils';

export const product = sqliteTable('product', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	shopifyId: text('shopify_id').unique(),
	stripeId: text('stripe_id').unique(),

	// URL slug (from Shopify's product handle; slugified title for local-only).
	handle: text('handle').unique(),

	// Basic info
	title: text('title').notNull(),
	description: text('description'),
	descriptionShort: text('description_short'),

	// Pricing currency only — the actual price lives on each variant.
	priceCurrency: text('price_currency', { enum: ['SEK', 'USD'] }).default('SEK'),

	// Book-specific fields
	sku: text('sku'),
	isbn: text('isbn'),

	// Search engine listing (Shopify product.seo). Admin-managed; pushed to Shopify.
	seoTitle: text('seo_title'),
	seoDescription: text('seo_description'),

	// Status
	status: text('status', { enum: statusEnum }).default('Draft').notNull(),

	...syncColumns,
	...commonColumns
});

export const productRelations = relations(product, ({ many }) => ({
	variants: many(variant),
	metafields: many(metafield),
	media: many(media),
	metaobjects: many(productsToMetaobjects)
}));

// Import these to avoid circular dependencies
import { variant } from './variant';
import { metafield } from './metafield';
import { media } from './media';
import { productsToMetaobjects } from './productsToMetaobjects';

// Validation schemas
export const productInsertSchema = v.object({
	...createInsertSchema(product).entries,
	title: v.pipe(v.string(), v.minLength(1, 'Title is required'))
});

export const productSelectSchema = createSelectSchema(product);

export type Product = typeof product.$inferSelect;
export type ProductInsert = typeof product.$inferInsert;
