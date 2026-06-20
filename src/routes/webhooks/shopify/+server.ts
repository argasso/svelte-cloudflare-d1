import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import * as schema from '$lib/db/schema';
import { handleWebhook, verifyShopifyHmac } from '$lib/server/sync/webhook';
import { getSettings } from '$lib/server/settings';

/**
 * Shopify webhook receiver (Shopify -> D1). Auth is the HMAC signature, so this
 * route sits outside /admin. Always reads the raw body for HMAC, then dispatches
 * by topic. Returns 200 for handled outcomes; 5xx only on unexpected errors so
 * Shopify retries transient failures.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const secret = env.SHOPIFY_WEBHOOK_SECRET;
	if (!secret) return new Response('webhook secret not configured', { status: 500 });

	const raw = await request.text();
	const valid = await verifyShopifyHmac(raw, request.headers.get('x-shopify-hmac-sha256'), secret);
	if (!valid) return new Response('invalid hmac', { status: 401 });

	// Kill switch: when the integration is off, ack with 200 (after verifying the
	// HMAC so unauthenticated calls are still rejected) and drop the payload so
	// Shopify doesn't retry-storm a disabled endpoint.
	const { syncEnabled } = await getSettings(locals.db);
	if (!syncEnabled) return new Response('sync disabled', { status: 200 });

	const topic = request.headers.get('x-shopify-topic') ?? '';
	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return new Response('invalid json', { status: 400 });
	}

	try {
		const outcome = await handleWebhook(locals.db, topic, payload);
		await locals.db.insert(schema.syncLog).values({
			entityType: outcome.entity === 'metaobject' ? 'metaobject' : 'product',
			entityId: 'id' in outcome ? outcome.id : topic,
			direction: 'shopify_to_d1',
			status: outcome.action === 'updated' ? 'success' : outcome.action === 'conflict' ? 'skipped' : 'skipped',
			errorMessage: outcome.action === 'updated' ? null : outcome.reason,
			// TEMP: capture the raw metaobject payload to diagnose missing SEO fields.
			payload: { topic, outcome, raw: topic.startsWith('metaobjects/') ? payload : undefined }
		});
		return new Response('ok');
	} catch (e) {
		console.error('webhook error', topic, e);
		return new Response('error', { status: 500 });
	}
};
