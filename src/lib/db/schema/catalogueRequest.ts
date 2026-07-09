import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';

/**
 * Print catalogue orders — one row per submission from the catalogue page's
 * request form. Notification email is sent on insert (best-effort, so a row
 * is still persisted even if Resend is down). Staff fulfil via /admin/katalog.
 */
export const catalogueRequestStatus = ['pending', 'sent', 'cancelled'] as const;
export type CatalogueRequestStatus = (typeof catalogueRequestStatus)[number];

export const catalogueRequest = sqliteTable('catalogue_request', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull(),
	phone: text('phone'),
	addressLine1: text('address_line1').notNull(),
	addressLine2: text('address_line2'),
	postalCode: text('postal_code').notNull(),
	city: text('city').notNull(),
	note: text('note'),
	status: text('status', { enum: catalogueRequestStatus }).default('pending').notNull(),
	/** IPv4/IPv6 for soft abuse tracking (not exposed to admins in the list). */
	ipAddress: text('ip_address'),
	sentAt: text('sent_at'),
	...commonColumns
});

export const catalogueRequestInsertSchema = createInsertSchema(catalogueRequest);
export const catalogueRequestSelectSchema = createSelectSchema(catalogueRequest);
export type CatalogueRequest = typeof catalogueRequest.$inferSelect;
export type CatalogueRequestInsert = typeof catalogueRequest.$inferInsert;
