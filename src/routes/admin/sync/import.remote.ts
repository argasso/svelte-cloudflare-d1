import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { getSettings } from '$lib/server/settings';
import { getCatalogSync } from '$lib/server/commerce';

/**
 * Run one step of the catalog import. The client drives the sequence in order
 * (authors → pages → products page-by-page → links) and loops each step until
 * its `next` is null. Bounded per call to stay within request limits.
 * Served from /_app/remote, so it self-guards with requireAdmin.
 */
export const runImportStep = command(
	v.object({
		step: v.picklist(['authors', 'pages', 'products', 'links']),
		cursor: v.optional(v.string())
	}),
	async ({ step, cursor }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const settings = await getSettings(event.locals.db);
		return getCatalogSync(settings).importStep(event.locals.db, step, cursor ?? null);
	}
);
