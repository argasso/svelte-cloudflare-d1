import { error } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import * as v from 'valibot';
import { assertSyncEnabled } from '$lib/server/settings';
import { applySync, createShopifyGateway, type SyncFilter } from '$lib/server/sync';
import type { SyncEntityType } from '$lib/server/sync/gateway';

function gateway() {
	const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
	if (!token) {
		error(500, 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured (set it as a wrangler secret in production).');
	}
	return createShopifyGateway(token);
}

/**
 * Push local changes to Shopify. Optional type/id targets a single record;
 * omitted pushes all dirty rows. Conflicts are never overwritten (applySync is
 * guarded) — they come back in the summary for review. Writes to PRODUCTION.
 */
export const pushSync = form(
	v.object({
		type: v.optional(v.string(), ''),
		id: v.optional(v.string(), '')
	}),
	async ({ type, id }) => {
		const event = getRequestEvent();
		const db = event.locals.db;
		await assertSyncEnabled(db);
		const filter: SyncFilter = {
			type: (type || undefined) as SyncEntityType | undefined,
			id: id || undefined
		};

		// Shopify ingests new images by URL — give the push this site's origin so
		// it can build absolute /media/<key> URLs for R2-owned images.
		const results = await applySync(db, gateway(), {
			apply: true,
			filter,
			baseUrl: event.url.origin
		});

		const summary = { pushed: 0, conflict: 0, failed: 0, skipped: 0 };
		for (const r of results) {
			if (r.applied) summary.pushed++;
			else if (r.decision.action === 'conflict') summary.conflict++;
			else if (r.error) summary.failed++;
			else summary.skipped++;
		}

		return {
			summary,
			entries: results.map((r) => ({
				type: r.type,
				title: r.title,
				action: r.applied ? 'pushed' : r.decision.action,
				error: r.error ?? null
			}))
		};
	}
);
