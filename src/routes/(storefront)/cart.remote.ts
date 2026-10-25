import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { readCart, writeCart, cartCount, resolveCart } from '$lib/server/cart';
import { getActiveCheckout } from '$lib/server/commerce/checkout';

const variantId = v.pipe(v.string(), v.minLength(1));

/** Add a variant to the cart (incrementing if already present). */
export const addToCart = command(
	v.object({ variantId, qty: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1) }),
	async ({ variantId, qty }) => {
		const { cookies, locals } = getRequestEvent();

		// Guard: a discontinued (out of print) variant can't be added.
		const discontinued = await locals.db.query.metafield.findFirst({
			where: and(
				eq(schema.metafield.ownerId, variantId),
				eq(schema.metafield.namespace, 'book'),
				eq(schema.metafield.key, 'discontinued'),
				eq(schema.metafield.value, 'true')
			),
			columns: { id: true }
		});
		if (discontinued) error(400, 'Den här utgåvan är utgången och säljs inte längre.');

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
 * Begin checkout for the cart via the active provider and return the URL to
 * redirect to. The provider decides what that means: Stripe creates a local
 * pending order + Checkout session; Shopify builds a cart and hands off to its
 * hosted checkout (and owns the order).
 */
export const startCheckout = command(async () => {
	const event = getRequestEvent();
	const db = event.locals.db;

	const cart = await resolveCart(db, readCart(event.cookies));
	if (cart.items.length === 0) error(400, 'Varukorgen är tom.');

	const checkout = await getActiveCheckout(db);
	if (!checkout.enabled) error(503, 'Betalning är inte konfigurerad.');

	const { redirectUrl } = await checkout.startCheckout({ db, cart, origin: event.url.origin });
	return { url: redirectUrl };
});
