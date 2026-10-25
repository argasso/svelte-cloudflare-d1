import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import type { ResolvedCart } from '$lib/server/cart';
import { createPendingOrder, markOrderPaid } from '$lib/server/orders';
import { sendOrderConfirmation } from '$lib/server/email';
import { getSettings } from '$lib/server/settings';
import { createStorefrontClient } from '$lib/shopify/storefront-client';
import { graphql } from '$lib/graphql';

export type CheckoutProviderId = 'shopify' | 'stripe' | 'none';

export interface StartCheckoutInput {
	db: DbClient;
	cart: ResolvedCart;
	/** Canonical site origin, for building return URLs. */
	origin: string;
}

export interface CheckoutProvider {
	readonly id: CheckoutProviderId;
	readonly enabled: boolean;
	/**
	 * Begin checkout for the resolved cart and return where to send the customer.
	 * Providers decide whether a local order is created: Stripe creates a pending
	 * order we own and settle via webhook; Shopify hands off to its hosted
	 * checkout and owns the resulting order itself.
	 */
	startCheckout(input: StartCheckoutInput): Promise<{ redirectUrl: string }>;
	/** Handle the provider's payment webhook (Stripe only). */
	receiveWebhook(db: DbClient, request: Request): Promise<Response>;
	/** Refund a payment (Stripe only); full when amountOre omitted. */
	refund(paymentIntentId: string, amountOre?: number): Promise<{ id: string; amount: number }>;
}

/** Line label shared by the providers (e.g. "Titel – Inbunden"). */
function lineName(item: ResolvedCart['items'][number]): string {
	return item.variantTitle && item.variantTitle !== 'Default Title'
		? `${item.title} – ${item.variantTitle}`
		: item.title;
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

function stripeClient(): Stripe {
	const key = env.STRIPE_SECRET_KEY;
	if (!key) error(500, 'STRIPE_SECRET_KEY is not configured.');
	// Fetch-based HTTP client so it runs on the Cloudflare Workers runtime.
	return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

/** Pull a shipping address out of a Checkout Session, tolerating API shape changes. */
function shippingFromSession(session: Stripe.Checkout.Session) {
	// shipping_details moved under collected_information in newer API versions.
	const s = session as unknown as {
		shipping_details?: { name?: string | null; address?: Record<string, string | null> | null };
		collected_information?: {
			shipping_details?: { name?: string | null; address?: Record<string, string | null> | null };
		};
	};
	const sd = s.shipping_details ?? s.collected_information?.shipping_details;
	const a = sd?.address;
	return {
		name: sd?.name ?? session.customer_details?.name ?? null,
		address: a
			? {
					line1: a.line1 ?? undefined,
					line2: a.line2 ?? undefined,
					postalCode: a.postal_code ?? undefined,
					city: a.city ?? undefined,
					country: a.country ?? undefined
				}
			: null
	};
}

export const stripeCheckout: CheckoutProvider = {
	id: 'stripe',
	get enabled() {
		return !!env.STRIPE_SECRET_KEY;
	},

	async startCheckout({ db, cart, origin }) {
		// Stripe-owned orders: create a pending order we settle on the webhook.
		const orderId = await createPendingOrder(db, cart);
		const session = await stripeClient().checkout.sessions.create({
			mode: 'payment',
			line_items: cart.items.map((i) => ({
				quantity: i.qty,
				price_data: {
					currency: 'sek',
					unit_amount: i.unitPrice,
					product_data: { name: lineName(i) }
				}
			})),
			shipping_options: [
				{
					shipping_rate_data: {
						type: 'fixed_amount',
						fixed_amount: { amount: cart.shipping, currency: 'sek' },
						display_name: cart.shipping > 0 ? 'Frakt' : 'Fri frakt'
					}
				}
			],
			shipping_address_collection: { allowed_countries: ['SE'] },
			client_reference_id: String(orderId),
			metadata: { orderId: String(orderId) },
			success_url: `${origin}/kassa/tack?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin}/varukorg`,
			locale: 'sv'
		});
		if (!session.url) error(502, 'Stripe did not return a checkout URL.');
		await db.update(schema.order).set({ stripeSessionId: session.id }).where(eq(schema.order.id, orderId));
		return { redirectUrl: session.url };
	},

	async receiveWebhook(db, request) {
		const secret = env.STRIPE_WEBHOOK_SECRET;
		if (!secret) return new Response('stripe webhook secret not configured', { status: 500 });
		const sig = request.headers.get('stripe-signature');
		if (!sig) return new Response('missing signature', { status: 400 });

		const raw = await request.text();
		let event: Stripe.Event;
		try {
			event = await stripeClient().webhooks.constructEventAsync(
				raw,
				sig,
				secret,
				undefined,
				Stripe.createSubtleCryptoProvider()
			);
		} catch {
			return new Response('invalid signature', { status: 400 });
		}

		// (refund implemented below; see the `refund` method)
		if (event.type === 'checkout.session.completed') {
			const session = event.data.object;
			const orderId = Number(session.client_reference_id ?? session.metadata?.orderId);
			if (Number.isInteger(orderId)) {
				const ship = shippingFromSession(session);
				const paid = await markOrderPaid(db, orderId, {
					paymentIntentId:
						typeof session.payment_intent === 'string'
							? session.payment_intent
							: (session.payment_intent?.id ?? null),
					email: session.customer_details?.email ?? null,
					customerName: ship.name,
					shippingAddress: ship.address,
					// Cross-check against the order total before fulfilling.
					paidAmount: session.amount_total ?? null
				});
				// Email exactly once — markOrderPaid returns the order only on the
				// first paid transition (best-effort; never fails the webhook).
				// Stripe calls this at the canonical domain, so its origin is the
				// right base for the customer's order-status link.
				if (paid) await sendOrderConfirmation(paid, paid.items, new URL(request.url).origin);
			}
		}
		return new Response('ok');
	},

	async refund(paymentIntentId, amountOre) {
		const r = await stripeClient().refunds.create({
			payment_intent: paymentIntentId,
			...(amountOre != null ? { amount: amountOre } : {})
		});
		return { id: r.id, amount: r.amount };
	}
};

// ---------------------------------------------------------------------------
// Shopify (hosted checkout — Shopify owns the order)
// ---------------------------------------------------------------------------

const CART_CREATE = graphql(`
	mutation CartCreate($lines: [CartLineInput!]!) {
		cartCreate(input: { lines: $lines }) {
			cart {
				checkoutUrl
			}
			userErrors {
				field
				message
			}
		}
	}
`);

export const shopifyCheckout: CheckoutProvider = {
	id: 'shopify',
	get enabled() {
		return !!env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
	},

	async startCheckout({ cart }) {
		// Shopify owns the order: build a Storefront cart and hand the customer to
		// Shopify's hosted checkout. No local order is created here; inbound order
		// ingestion is out of scope for now. The local cart cookie is left intact
		// so an abandoned checkout keeps the basket.
		const token = env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
		if (!token) error(503, 'Shopify Storefront-token saknas.');

		// variant.id is the Shopify variant GID, so it is a valid merchandiseId.
		const lines = cart.items.map((i) => ({ merchandiseId: i.variantId, quantity: i.qty }));
		const client = createStorefrontClient(token);
		const res = await client.mutation(CART_CREATE, { lines }).toPromise();

		if (res.error) error(502, 'Kunde inte skapa Shopify-varukorg.');
		const userErrors = res.data?.cartCreate?.userErrors ?? [];
		if (userErrors.length > 0) error(502, userErrors[0].message || 'Shopify-varukorgen avvisades.');
		const url = res.data?.cartCreate?.cart?.checkoutUrl;
		if (!url) error(502, 'Shopify returnerade ingen checkout-URL.');

		return { redirectUrl: url };
	},

	async receiveWebhook() {
		// No inbound Shopify order ingestion yet.
		return new Response('shopify webhooks not handled', { status: 501 });
	},

	async refund() {
		error(501, 'Refund Shopify-ordrar i Shopify-admin.');
	}
};

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

const noneCheckout: CheckoutProvider = {
	id: 'none',
	enabled: false,
	async startCheckout() {
		error(503, 'Betalning är inte konfigurerad.');
	},
	async receiveWebhook() {
		return new Response('payments not configured', { status: 500 });
	},
	async refund() {
		error(503, 'Betalning är inte konfigurerad.');
	}
};

const PROVIDERS: Record<'shopify' | 'stripe', CheckoutProvider> = {
	shopify: shopifyCheckout,
	stripe: stripeCheckout
};

/**
 * The active checkout provider, chosen by the `checkoutProvider` setting
 * (default Shopify). Falls back to a no-op provider when the chosen one isn't
 * configured, so a stale client can't start an unpayable checkout.
 */
export async function getActiveCheckout(db: DbClient): Promise<CheckoutProvider> {
	const { checkoutProvider } = await getSettings(db);
	const provider = PROVIDERS[checkoutProvider] ?? shopifyCheckout;
	return provider.enabled ? provider : noneCheckout;
}
