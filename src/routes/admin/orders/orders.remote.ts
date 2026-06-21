import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import * as schema from '$lib/db/schema';
import { getCheckout } from '$lib/server/commerce/checkout';
import { recordRefund } from '$lib/server/orders';
import { sendRefundConfirmation } from '$lib/server/email';

const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

/**
 * Move an order between fulfilment states. Only paid↔fulfilled and a cancel are
 * allowed; we never flip an order back to `pending` (that's pre-payment only).
 */
export const setOrderStatus = form(
	v.object({ id: idField, status: v.picklist(['paid', 'fulfilled', 'cancelled']) }),
	async ({ id, status }) => {
		const event = getRequestEvent();
		await requireAdmin(event);

		const order = await event.locals.db.query.order.findFirst({
			where: eq(schema.order.id, id),
			columns: { id: true, status: true }
		});
		if (!order) error(404, 'Order not found');
		if (order.status === 'pending') error(400, 'Order is not paid yet.');

		await event.locals.db
			.update(schema.order)
			.set({ status, updatedAt: new Date().toISOString() })
			.where(eq(schema.order.id, id));

		return { success: true };
	}
);

/** Öre amount from a "kr" text field; empty = full refund (the remaining amount). */
const amountField = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => {
		const t = s.trim().replace(',', '.');
		if (t === '') return null;
		const n = Number(t);
		return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
	})
);

/**
 * Refund an order via Stripe, then record it (restocking on a full refund) and
 * email the customer. `amount` empty = refund whatever is still outstanding.
 */
export const refundOrder = form(
	v.object({ id: idField, amount: amountField }),
	async ({ id, amount }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;

		const order = await db.query.order.findFirst({ where: eq(schema.order.id, id) });
		if (!order) error(404, 'Order not found');
		if (!order.stripePaymentIntentId) error(400, 'Order has no payment to refund.');

		const outstanding = order.total - order.refundedAmount;
		if (outstanding <= 0) error(400, 'Order is already fully refunded.');

		const refundAmount = amount == null ? outstanding : Math.min(amount, outstanding);
		const refund = await getCheckout().refund(
			order.stripePaymentIntentId,
			// Omit when refunding the full remaining amount so Stripe refunds the rest.
			refundAmount === outstanding ? undefined : refundAmount
		);

		const updated = await recordRefund(db, id, refund.amount, refund.id);
		if (updated) await sendRefundConfirmation(updated, refund.amount);

		return { success: true };
	}
);
