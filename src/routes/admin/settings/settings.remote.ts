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

/**
 * Choose the storefront checkout provider. Shopify hands off to Shopify's
 * hosted checkout; Stripe uses our local orders + Stripe Checkout.
 */
export const setCheckoutProvider = form(
	v.object({ provider: v.picklist(['shopify', 'stripe']) }),
	async ({ provider }) => {
		const event = getRequestEvent();
		await requireAdmin(event);

		await updateSettings(event.locals.db, { checkoutProvider: provider });

		return { checkoutProvider: provider };
	}
);
