import { error } from '@sveltejs/kit';
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import type { DbClient } from '$lib/server/db';
import { markOrderPaid } from '$lib/server/orders';
import { sendOrderConfirmation } from '$lib/server/email';

export type CheckoutItem = { name: string; unitPrice: number; qty: number };

export interface CheckoutSessionInput {
	orderId: number;
	items: CheckoutItem[];
	shipping: number; // öre
	successUrl: string;
	cancelUrl: string;
}

export interface Checkout {
	readonly id: string;
	readonly enabled: boolean;
	/** Create a hosted checkout session; returns the redirect URL + provider id. */
	createSession(input: CheckoutSessionInput): Promise<{ url: string; id: string }>;
	/** Handle the provider's payment webhook. */
	receiveWebhook(db: DbClient, request: Request): Promise<Response>;
	/** Refund a payment (full when amountOre omitted); returns the refund id + öre. */
	refund(paymentIntentId: string, amountOre?: number): Promise<{ id: string; amount: number }>;
}

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

export const stripeCheckout: Checkout = {
	id: 'stripe',
	get enabled() {
		return !!env.STRIPE_SECRET_KEY;
	},

	async createSession({ orderId, items, shipping, successUrl, cancelUrl }) {
		const session = await stripeClient().checkout.sessions.create({
			mode: 'payment',
			line_items: items.map((i) => ({
				quantity: i.qty,
				price_data: {
					currency: 'sek',
					unit_amount: i.unitPrice,
					product_data: { name: i.name }
				}
			})),
			shipping_options: [
				{
					shipping_rate_data: {
						type: 'fixed_amount',
						fixed_amount: { amount: shipping, currency: 'sek' },
						display_name: shipping > 0 ? 'Frakt' : 'Fri frakt'
					}
				}
			],
			shipping_address_collection: { allowed_countries: ['SE'] },
			client_reference_id: String(orderId),
			metadata: { orderId: String(orderId) },
			success_url: successUrl,
			cancel_url: cancelUrl,
			locale: 'sv'
		});
		if (!session.url) error(502, 'Stripe did not return a checkout URL.');
		return { url: session.url, id: session.id };
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
					shippingAddress: ship.address
				});
				// Email exactly once — markOrderPaid returns the order only on the
				// first paid transition (best-effort; never fails the webhook).
				if (paid) await sendOrderConfirmation(paid, paid.items);
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

const noneCheckout: Checkout = {
	id: 'none',
	enabled: false,
	async createSession() {
		error(503, 'Payments are not configured.');
	},
	async receiveWebhook() {
		return new Response('payments not configured', { status: 500 });
	},
	async refund() {
		error(503, 'Payments are not configured.');
	}
};

/** The active checkout provider (Stripe when configured, else a no-op). */
export function getCheckout(): Checkout {
	return env.STRIPE_SECRET_KEY ? stripeCheckout : noneCheckout;
}
