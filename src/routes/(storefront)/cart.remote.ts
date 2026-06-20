import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { readCart, writeCart, cartCount, resolveCart } from '$lib/server/cart';
import { createPendingOrder } from '$lib/server/orders';
import { getCheckout } from '$lib/server/commerce/checkout';

const variantId = v.pipe(v.string(), v.minLength(1));

/** Add a variant to the cart (incrementing if already present). */
export const addToCart = command(
	v.object({ variantId, qty: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1) }),
	async ({ variantId, qty }) => {
		const { cookies } = getRequestEvent();
		const lines = readCart(cookies);
		const existing = lines.find((l) => l.variantId === variantId);
		if (existing) existing.qty = Math.min(existing.qty + qty, 99);
		else lines.push({ variantId, qty });
		writeCart(cookies, lines);
		return { count: cartCount(cookies) };
	}
);

/** Set an exact quantity (0 removes the line). */
export const setQty = command(
	v.object({ variantId, qty: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
	async ({ variantId, qty }) => {
		const { cookies } = getRequestEvent();
		let lines = readCart(cookies);
		if (qty <= 0) {
			lines = lines.filter((l) => l.variantId !== variantId);
		} else {
			const existing = lines.find((l) => l.variantId === variantId);
			if (existing) existing.qty = Math.min(qty, 99);
			else lines.push({ variantId, qty });
		}
		writeCart(cookies, lines);
		return { count: cartCount(cookies) };
	}
);

export const removeFromCart = command(v.object({ variantId }), async ({ variantId }) => {
	const { cookies } = getRequestEvent();
	writeCart(
		cookies,
		readCart(cookies).filter((l) => l.variantId !== variantId)
	);
	return { count: cartCount(cookies) };
});

/**
 * Create a pending order from the cart and a hosted checkout session; returns
 * the provider URL to redirect to. The cart is cleared on the success page.
 */
export const startCheckout = command(async () => {
	const event = getRequestEvent();
	const db = event.locals.db;

	const cart = await resolveCart(db, readCart(event.cookies));
	if (cart.items.length === 0) error(400, 'Varukorgen är tom.');

	const checkout = getCheckout();
	if (!checkout.enabled) error(503, 'Betalning är inte konfigurerad.');

	const orderId = await createPendingOrder(db, cart);
	const origin = event.url.origin;
	const { url, id } = await checkout.createSession({
		orderId,
		items: cart.items.map((i) => ({
			name:
				i.variantTitle && i.variantTitle !== 'Default Title'
					? `${i.title} – ${i.variantTitle}`
					: i.title,
			unitPrice: i.unitPrice,
			qty: i.qty
		})),
		shipping: cart.shipping,
		successUrl: `${origin}/kassa/tack?session_id={CHECKOUT_SESSION_ID}`,
		cancelUrl: `${origin}/varukorg`
	});

	await db.update(schema.order).set({ stripeSessionId: id }).where(eq(schema.order.id, orderId));
	return { url };
});
