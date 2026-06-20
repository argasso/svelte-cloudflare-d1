import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { writeCart } from '$lib/server/cart';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const sessionId = url.searchParams.get('session_id');
	const order = sessionId
		? await locals.db.query.order.findFirst({
				where: eq(schema.order.stripeSessionId, sessionId),
				with: { items: true }
			})
		: null;

	// Stripe only redirects here after a completed payment, so clear the cart.
	writeCart(cookies, []);

	return { order: order ?? null };
};
