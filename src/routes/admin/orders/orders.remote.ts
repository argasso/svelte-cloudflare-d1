import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import * as schema from '$lib/db/schema';

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
