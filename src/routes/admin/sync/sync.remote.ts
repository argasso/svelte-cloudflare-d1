import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { getSettings } from '$lib/server/settings';
import { getCatalogSync } from '$lib/server/commerce';
import type { SyncFilter } from '$lib/server/sync';
import type { SyncEntityType } from '$lib/server/sync/gateway';

/**
 * Push local changes to the catalog provider. Optional type/id targets a single
 * record; omitted pushes all dirty rows. Conflicts are never overwritten — they
 * come back in the summary for review. Writes to PRODUCTION.
 */
export const pushSync = form(
	v.object({
		type: v.optional(v.string(), ''),
		id: v.optional(v.string(), ''),
		// Product-family scope: push this product AND its variants in one go (the
		// unit the sync UI lists). Takes precedence over type/id.
		productId: v.optional(v.string(), '')
	}),
	async ({ type, id, productId }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const settings = await getSettings(event.locals.db);

		const filter: SyncFilter = productId
			? { productId: Number(productId) }
			: {
					type: (type || undefined) as SyncEntityType | undefined,
					id: id || undefined
				};

		// Shopify ingests new images by URL — give the push this site's origin so
		// it can build absolute /media/<key> URLs for R2-owned images.
		return getCatalogSync(settings).push(event.locals.db, { filter, baseUrl: event.url.origin });
	}
);
