import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';
import { product } from './product';
import { metaobject } from './metaobject';

/**
 * Media table - stores references to images, videos, and files
 * Can be stored in R2 or reference Shopify CDN URLs
 */
export const media = sqliteTable('media', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	shopifyId: text('shopify_id').unique(),

	// Polymorphic entity reference
	entityType: text('entity_type', { enum: ['product', 'variant', 'metaobject'] }).notNull(),
	entityId: text('entity_id').notNull(),

	// Media type
	mediaType: text('media_type', { enum: ['image', 'video', 'audio', 'file'] }).notNull(),

	// Storage locations
	r2Key: text('r2_key'), // Path in R2: "products/123/cover.jpg"
	shopifyUrl: text('shopify_url'), // Fallback CDN URL

	// Metadata
	altText: text('alt_text'),
	width: integer('width'),
	height: integer('height'),
	fileSize: integer('file_size'),
	mimeType: text('mime_type'),

	position: integer('position').default(0), // Ordering
	migratedToR2: integer('migrated_to_r2', { mode: 'boolean' }).default(false),

	...commonColumns
});

export const mediaRelations = relations(media, ({ one }) => ({
	product: one(product, {
		fields: [media.entityId],
		references: [product.id]
	}),
	metaobject: one(metaobject, {
		fields: [media.entityId],
		references: [metaobject.id]
	})
}));

export const mediaInsertSchema = createInsertSchema(media);
export const mediaSelectSchema = createSelectSchema(media);

export type Media = typeof media.$inferSelect;
export type MediaInsert = typeof media.$inferInsert;
