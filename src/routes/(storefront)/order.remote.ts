import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { recordWithdrawal } from '$lib/server/orders';
import { sendWithdrawalAck } from '$lib/server/email';

/**
 * EU right-of-withdrawal declaration (Dir. 2023/2673). Public, but guarded by
 * the order's unguessable access token + the customer re-entering their name
 * (the directive's two-step: declare intent, then confirm name + order). Records
 * the request and acknowledges by email (durable medium); staff handle the
 * refund/return.
 */
export const requestWithdrawal = form(
	v.object({
		orderId: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number)),
		token: v.pipe(v.string(), v.minLength(1)),
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Ange ditt namn'))
	}),
	async ({ orderId, token, name }) => {
		const db = getRequestEvent().locals.db;

		const order = await db.query.order.findFirst({ where: eq(schema.order.id, orderId) });
		if (!order || !order.accessToken || order.accessToken !== token) error(404, 'Order not found');
		if (order.status !== 'paid' && order.status !== 'fulfilled') {
			error(400, 'Ordern kan inte ångras.');
		}

		// Keep the customer-entered name if we didn't already have one.
		if (!order.customerName) {
			await db.update(schema.order).set({ customerName: name }).where(eq(schema.order.id, orderId));
		}

		const updated = await recordWithdrawal(db, orderId);
		if (updated) await sendWithdrawalAck(updated);

		return { success: true };
	}
);
