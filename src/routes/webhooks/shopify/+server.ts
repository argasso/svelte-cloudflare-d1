import type { RequestHandler } from './$types';
import { getSettings } from '$lib/server/settings';
import { getCatalogSync } from '$lib/server/commerce';

/**
 * Shopify webhook receiver (Shopify -> D1). Auth is the HMAC signature (verified
 * by the provider), so this route sits outside /admin. The active catalog
 * provider handles verification, dispatch, logging, and the response; when the
 * integration is off, the no-op provider just acks with 200.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const settings = await getSettings(locals.db);
	return getCatalogSync(settings).receiveWebhook(locals.db, request);
};
