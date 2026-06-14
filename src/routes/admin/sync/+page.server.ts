import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { listDirty } from '$lib/server/sync';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

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
