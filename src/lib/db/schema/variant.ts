import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns, syncColumns } from '../utils';
import { product } from './product';
import { metafield } from './metafield';

export const variant = sqliteTable('variant', {
	id: text('id').primaryKey(), // Shopify GID
	productId: integer('product_id')
		.notNull()
		.references(() => product.id, { onDelete: 'cascade' }),

	// Basic info
	title: text('title').notNull(),
	sku: text('sku'),
	barcode: text('barcode'),

	// The variant's selected image — a MediaImage gid that points at one of the
	// product's `media` rows (resolve via media.shopifyId).
	imageShopifyId: text('image_shopify_id'),

	// Pricing
	price: real('price').notNull(),
	compareAtPrice: real('compare_at_price'),

	// Variant options
	option1: text('option1'),
	option2: text('option2'),
	option3: text('option3'),

	// Inventory
	inventoryItemId: text('inventory_item_id'),
	inventoryQuantity: integer('inventory_quantity').default(0),
	requiresShipping: integer('requires_shipping', { mode: 'boolean' }).default(true),
	taxable: integer('taxable', { mode: 'boolean' }).default(true),

	// Physical attributes
	weight: real('weight'),
	weightUnit: text('weight_unit', { enum: ['g', 'kg', 'lb', 'oz'] }),

	...syncColumns,
	...commonColumns
});

export const variantRelations = relations(variant, ({ one, many }) => ({
	product: one(product, {
		fields: [variant.productId],
		references: [product.id]
	}),
	metafields: many(metafield)
}));

export const variantInsertSchema = createInsertSchema(variant);
export const variantSelectSchema = createSelectSchema(variant);

export type Variant = typeof variant.$inferSelect;
export type VariantInsert = typeof variant.$inferInsert;
