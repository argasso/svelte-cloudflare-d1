import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns, statusEnum, syncColumns } from '../utils';
import { media } from './media';
import { productsToMetaobjects } from './productsToMetaobjects';

/**
 * Field shapes per metaobject type, mirroring the Shopify metaobject
 * definitions (and what the import scripts write). The `type` column is
 * the discriminant; use `isAuthor`/`isPage` to narrow a row.
 */
export type AuthorFields = {
	name?: string | null;
	/** Shopify rich text JSON string */
	description?: string | null;
	/** MediaImage gid, e.g. gid://shopify/MediaImage/… */
	image?: string | null;
};

export type PageFields = {
	title?: string | null;
	name?: string | null;
	/** Shopify rich text JSON string */
	content?: string | null;
	sektioner?: string | null;
	reference?: string | null;
	/** Metaobject gids of child pages */
	sub_pages?: string[] | null;
	meta_title_seo?: string | null;
	meta_description_seo?: string | null;
	show_table_of_contents?: boolean | null;
};

export type FieldsByType = {
	author: AuthorFields;
	page: PageFields;
};

export type MetaobjectType = keyof FieldsByType;
export type MetaobjectFields = FieldsByType[MetaobjectType];

/**
 * Metaobject table - stores Pages, Authors, and other Shopify metaobjects
 * Uses flexible JSON fields to support any metaobject type
 */
export const metaobject = sqliteTable('metaobject', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	shopifyId: text('shopify_id').unique(),

	// Metaobject identification
	handle: text('handle').notNull(),
	type: text('type').$type<MetaobjectType>().notNull(),

	// All metaobject fields stored as JSON for flexibility
	fields: text('fields', { mode: 'json' }).$type<MetaobjectFields>(),

	// Denormalized fields for performance
	title: text('title'), // Extracted from fields.title
	parentId: integer('parent_id').references((): any => metaobject.id),
	position: integer('position').default(0),

	// Status
	status: text('status', { enum: statusEnum }).default('Active').notNull(),

	...syncColumns,
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

/** A metaobject row narrowed to a specific type, with matching fields */
export type MetaobjectOf<T extends MetaobjectType> = Metaobject & {
	type: T;
	fields: FieldsByType[T] | null;
};

export function isMetaobjectOf<T extends MetaobjectType>(
	m: Metaobject,
	type: T
): m is MetaobjectOf<T> {
	return m.type === type;
}

export const isAuthor = (m: Metaobject): m is MetaobjectOf<'author'> => m.type === 'author';
export const isPage = (m: Metaobject): m is MetaobjectOf<'page'> => m.type === 'page';
