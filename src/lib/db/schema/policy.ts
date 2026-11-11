import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';

/**
 * Shopify shop policies (Terms of Service, Privacy Policy, …) mirrored into D1.
 *
 * These are NOT metaobjects/pages — they're the shop's legal policies, exposed
 * by the Storefront API as `shop.termsOfService`, `shop.privacyPolicy`, etc.
 * (the Admin API gates them behind the `read_legal_policies` scope). `body` is
 * ready-to-render HTML authored in Shopify; we store it verbatim and sanitise
 * at render time. Inbound-only: edited in Shopify, pulled by the import step —
 * never pushed back. `handle` is the storefront route slug (Swedish), `type`
 * the stable Shopify field name used as the upsert key.
 */
export const policy = sqliteTable('policy', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Stable Shopify policy identity / upsert key, e.g. 'termsOfService'. */
	type: text('type').notNull().unique(),
	/** Storefront route slug, e.g. 'forsaljningsvillkor'. */
	handle: text('handle').notNull().unique(),
	/** Shopify's policy title (English in the shop); the route renders its own. */
	title: text('title').notNull(),
	/** Policy body as HTML, straight from Shopify (sanitised at render time). */
	body: text('body').notNull(),
	shopifyId: text('shopify_id'),
	...commonColumns
});

export const policyInsertSchema = createInsertSchema(policy);
export const policySelectSchema = createSelectSchema(policy);

export type Policy = typeof policy.$inferSelect;
export type PolicyInsert = typeof policy.$inferInsert;
