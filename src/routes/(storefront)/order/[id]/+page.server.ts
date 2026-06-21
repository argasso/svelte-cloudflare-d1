import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const id = parseInt(params.id);
	const token = url.searchParams.get('token');
	if (Number.isNaN(id) || !token) error(404, 'Order not found');

	const order = await locals.db.query.order.findFirst({
		where: eq(schema.order.id, id),
		with: { items: true }
	});
	// Constant-ish guard: unknown order or wrong/missing token → 404 (don't leak).
	if (!order || !order.accessToken || order.accessToken !== token) error(404, 'Order not found');

	// Withdrawal is offered for a paid/fulfilled order that hasn't already been
	// withdrawn or refunded. (We surface it generously; the 14-day right is noted
	// in the UI rather than hard-gated, since we don't track the delivery date.)
	const withdrawable =
		(order.status === 'paid' || order.status === 'fulfilled') &&
		!order.withdrawalRequestedAt &&
		order.refundedAmount === 0;

	return { order, token, withdrawable };
};
