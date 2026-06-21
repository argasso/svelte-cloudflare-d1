import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';

/**
 * Customer orders. Money is stored in minor units (öre) as integers to avoid
 * float drift. Prices are VAT-inclusive (Swedish books = 6%); `vatAmount` is the
 * VAT portion of the goods, recorded for bookkeeping. An order is created
 * `pending` before redirecting to Stripe and flipped to `paid` by the webhook.
 */
export const order = sqliteTable('order', {
	id: integer('id').primaryKey({ autoIncrement: true }),

	status: text('status', {
		enum: ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded']
	})
		.notNull()
		.default('pending'),

	// Customer + shipping (captured by Stripe Checkout, copied back on the webhook)
	email: text('email'),
	customerName: text('customer_name'),
	shippingAddress: text('shipping_address', { mode: 'json' }).$type<{
		line1?: string;
		line2?: string;
		postalCode?: string;
		city?: string;
		country?: string;
	} | null>(),

	// Amounts in öre (SEK minor units)
	subtotal: integer('subtotal').notNull(), // goods, VAT-inclusive
	shipping: integer('shipping').notNull().default(0),
	vatAmount: integer('vat_amount').notNull().default(0), // VAT portion of goods (6%)
	total: integer('total').notNull(),
	currency: text('currency').notNull().default('SEK'),

	stripeSessionId: text('stripe_session_id').unique(),
	stripePaymentIntentId: text('stripe_payment_intent_id'),

	// Refunds (öre). refundedAmount accumulates partial refunds; status flips to
	// 'refunded' once it reaches the total.
	stripeRefundId: text('stripe_refund_id'),
	refundedAmount: integer('refunded_amount').notNull().default(0),
	refundedAt: text('refunded_at'),

	// Gapless receipt number, assigned when the order is paid (bookkeeping).
	receiptNumber: integer('receipt_number').unique(),

	// Unguessable token for the customer's order-status page (guest checkout, no
	// accounts). Set at order creation; used to reach the EU withdrawal function.
	accessToken: text('access_token'),
	// EU right of withdrawal (Dir. 2023/2673): when the customer declared it.
	withdrawalRequestedAt: text('withdrawal_requested_at'),

	...commonColumns
});

export const orderItem = sqliteTable('order_item', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	orderId: integer('order_id')
		.notNull()
		.references(() => order.id, { onDelete: 'cascade' }),

	variantId: text('variant_id').notNull(), // Shopify/local variant gid
	productId: integer('product_id'),
	title: text('title').notNull(), // snapshot at purchase time
	unitPrice: integer('unit_price').notNull(), // öre, VAT-inclusive
	quantity: integer('quantity').notNull(),
	lineTotal: integer('line_total').notNull() // öre
});

export const orderRelations = relations(order, ({ many }) => ({
	items: many(orderItem)
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
	order: one(order, { fields: [orderItem.orderId], references: [order.id] })
}));

export const orderInsertSchema = createInsertSchema(order);
export const orderSelectSchema = createSelectSchema(order);

export type Order = typeof order.$inferSelect;
export type OrderInsert = typeof order.$inferInsert;
export type OrderItem = typeof orderItem.$inferSelect;
