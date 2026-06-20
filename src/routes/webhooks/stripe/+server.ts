import type { RequestHandler } from './$types';
import { getCheckout } from '$lib/server/commerce/checkout';

/**
 * Stripe payment webhook (Stripe -> D1). Auth is the Stripe signature, verified
 * by the checkout provider. On checkout.session.completed the matching pending
 * order is marked paid and inventory is decremented.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	return getCheckout().receiveWebhook(locals.db, request);
};
