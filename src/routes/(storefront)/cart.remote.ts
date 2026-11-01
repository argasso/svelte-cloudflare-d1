import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { readCart, writeCart, resolveCart } from '$lib/server/cart';
import { getActiveCheckout } from '$lib/server/commerce/checkout';

// Cart mutations are remote `form()` (not `command()`) so the customer-facing
// cart works with JavaScript disabled: each is a real <form> that POSTs natively
// when unenhanced, and SvelteKit re-renders/redirects server-side. `.enhance()`
// (or the default enhancement) upgrades the experience when JS is on. Form fields
// arrive as strings, so numeric inputs are coerced in the schema.

const variantId = v.pipe(v.string(), v.minLength(1));
const qtyField = v.pipe(
	v.string(),
	v.transform((s) => Number(s)),
	v.number('Ogiltigt antal'),
	v.integer(),
	v.minValue(0),
	v.maxValue(99)
);

/** Add a variant to the cart (incrementing if already present). */
export const addToCart = form(v.object({ variantId }), async ({ variantId }) => {
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
	if (existing) existing.qty = Math.min(existing.qty + 1, 99);
	else lines.push({ variantId, qty: 1 });
	writeCart(cookies, lines);
});

/** Set an exact quantity (0 removes the line). */
export const setQty = form(v.object({ variantId, qty: qtyField }), async ({ variantId, qty }) => {
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
});

/** Remove a line entirely. */
export const removeFromCart = form(v.object({ variantId }), async ({ variantId }) => {
	const { cookies } = getRequestEvent();
	writeCart(
		cookies,
		readCart(cookies).filter((l) => l.variantId !== variantId)
	);
});

/**
 * Begin checkout via the active provider and redirect to it. As a `form()` this
 * works without JS: a native POST follows the 303 to the provider; with JS the
 * enhanced submit follows the same redirect. The provider decides what happens —
 * Stripe creates a local pending order + Checkout session; Shopify builds a cart
 * and hands off to its hosted checkout (and owns the order).
 */
export const startCheckout = form(v.object({}), async () => {
	const event = getRequestEvent();
	const db = event.locals.db;

	const cart = await resolveCart(db, readCart(event.cookies));
	if (cart.items.length === 0) error(400, 'Varukorgen är tom.');

	const checkout = await getActiveCheckout(db);
	if (!checkout.enabled) error(503, 'Betalning är inte konfigurerad.');

	const { redirectUrl } = await checkout.startCheckout({ db, cart, origin: event.url.origin });
	redirect(303, redirectUrl);
});
