import type { RequestHandler } from './$types';
import { stripeCheckout } from '$lib/server/commerce/checkout';

/**
 * Stripe payment webhook (Stripe -> D1). Auth is the Stripe signature, verified
 * by the Stripe provider. On checkout.session.completed the matching pending
 * order is marked paid and inventory is decremented. This endpoint is
 * Stripe-specific regardless of the active provider setting.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	return stripeCheckout.receiveWebhook(locals.db, request);
};
