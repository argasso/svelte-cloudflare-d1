import { desc } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { listDirty } from '$lib/server/sync';
import { getSettings } from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Kill switch: with the Shopify integration off there's nothing to sync —
	// send the user to settings where they can re-enable it.
	const { syncEnabled } = await getSettings(db);
	if (!syncEnabled) redirect(302, '/admin/settings');

	// Local-only: what has unpushed edits (no Shopify calls here — keep load fast)
	const dirty = await listDirty(db);

	// Recent sync activity for visibility into pushes/conflicts
	const recent = await db
		.select()
		.from(schema.syncLog)
		.orderBy(desc(schema.syncLog.timestamp), desc(schema.syncLog.id))
		.limit(25);

	return { dirty, recent };
};
