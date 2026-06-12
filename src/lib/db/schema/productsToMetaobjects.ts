import { relations } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-valibot';
import { product } from './product';
import { metaobject } from './metaobject';

/**
 * Junction table linking products to metaobjects (pages/categories, authors, etc.)
 */
export const productsToMetaobjects = sqliteTable(
	'products_to_metaobjects',
	{
		productId: integer('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		metaobjectId: integer('metaobject_id')
			.notNull()
			.references(() => metaobject.id, { onDelete: 'cascade' }),

		// Optional: specify relationship type
		relationType: text('relation_type', {
			enum: ['category', 'author', 'featured_in']
		}).default('category'),

		// Order within category
		position: integer('position').default(0)
	},
	(table) => ({
		pk: primaryKey({ columns: [table.productId, table.metaobjectId] })
	})
);

export const productsToMetaobjectsRelations = relations(
	productsToMetaobjects,
	({ one }) => ({
		product: one(product, {
			fields: [productsToMetaobjects.productId],
			references: [product.id]
		}),
		metaobject: one(metaobject, {
			fields: [productsToMetaobjects.metaobjectId],
			references: [metaobject.id]
		})
	})
);

export const productsToMetaobjectsInsertSchema = createInsertSchema(productsToMetaobjects);

export type ProductsToMetaobjects = typeof productsToMetaobjects.$inferSelect;
export type ProductsToMetaobjectsInsert = typeof productsToMetaobjects.$inferInsert;
