import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns, statusEnum } from '../utils';
import { media } from './media';
import { productsToMetaobjects } from './productsToMetaobjects';

type AuthorFields = { name: string; description: string };
type NewsFields = { title: string; content: string; author: string };
type PageFields = { title: string; page_top: string; sub_pages: string[] };

/**
 * Metaobject table - stores Pages, Authors, News, and other Shopify metaobjects
 * Uses flexible JSON fields to support any metaobject type
 */
export const metaobject = sqliteTable('metaobject', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	shopifyId: text('shopify_id').unique(),

	// Metaobject identification
	handle: text('handle').notNull(),
	type: text('type').notNull(), // 'page', 'author', 'news', etc.

	// All metaobject fields stored as JSON for flexibility
	fields: text('fields', { mode: 'json' }).$type<AuthorFields | NewsFields | PageFields>(),

	// Denormalized fields for performance
	title: text('title'), // Extracted from fields.title
	parentId: integer('parent_id').references((): any => metaobject.id),
	position: integer('position').default(0),

	// Status
	status: text('status', { enum: statusEnum }).default('Active').notNull(),

	...commonColumns
});

export const metaobjectRelations = relations(metaobject, ({ one, many }) => ({
	parent: one(metaobject, {
		fields: [metaobject.parentId],
		references: [metaobject.id],
		relationName: 'metaobjectHierarchy'
	}),
	children: many(metaobject, { relationName: 'metaobjectHierarchy' }),
	products: many(productsToMetaobjects),
	media: many(media)
}));

export const metaobjectInsertSchema = createInsertSchema(metaobject);
export const metaobjectSelectSchema = createSelectSchema(metaobject);

export type Metaobject = typeof metaobject.$inferSelect;
export type MetaobjectInsert = typeof metaobject.$inferInsert;
