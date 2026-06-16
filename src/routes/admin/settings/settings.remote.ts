import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { updateSettings } from '$lib/server/settings';

/**
 * Toggle the Shopify integration master switch. `enabled` arrives as a string
 * from the form. Guards itself (forms are served from /_app/remote, outside the
 * path-based /admin hook).
 */
export const setSyncEnabled = form(
	v.object({ enabled: v.picklist(['true', 'false']) }),
	async ({ enabled }) => {
		const event = getRequestEvent();
		await requireAdmin(event);

		const syncEnabled = enabled === 'true';
		await updateSettings(event.locals.db, { syncEnabled });

		return { syncEnabled };
	}
);
