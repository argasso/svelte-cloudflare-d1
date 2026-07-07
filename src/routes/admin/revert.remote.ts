import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { getSettings } from '$lib/server/settings';
import { getCatalogSync } from '$lib/server/commerce';

/**
 * Discard a record's unpushed local edits by pulling Shopify's current version
 * (via the catalog-sync seam). No-op provider errors when sync is off.
 */
export const revertToShopify = command(
	v.object({
		type: v.picklist(['product', 'metaobject']),
		id: v.pipe(v.number(), v.integer())
	}),
	async ({ type, id }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const settings = await getSettings(event.locals.db);
		await getCatalogSync(settings).revert(event.locals.db, { type, id });
		return { success: true };
	}
);
