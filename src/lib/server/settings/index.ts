import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';

/**
 * Typed runtime settings. Backed by the key/value `setting` table; missing keys
 * fall back to {@link SETTINGS_DEFAULTS}. Keep this small and serializable — each
 * field maps to one row keyed by the property name.
 */
export type AppSettings = {
	/**
	 * Master switch for the Shopify integration. When false, all push/pull paths
	 * (the /admin/sync UI, import + push remote functions, and the inbound
	 * webhook) become no-ops. This is the kill switch toward fully owning the data
	 * and leaving Shopify — nothing else in the app depends on Shopify at runtime.
	 */
	syncEnabled: boolean;
};

export const SETTINGS_DEFAULTS: AppSettings = {
	syncEnabled: true
};

/** Read all settings, merged over the typed defaults. One indexed table scan. */
export async function getSettings(db: DbClient): Promise<AppSettings> {
	const rows = await db.select().from(schema.setting);
	const result: AppSettings = { ...SETTINGS_DEFAULTS };
	for (const row of rows) {
		if (row.key in result) {
			(result as Record<string, unknown>)[row.key] = row.value;
		}
	}
	return result;
}

/** Upsert one or more settings keys. Values are stored as JSON. */
export async function updateSettings(db: DbClient, patch: Partial<AppSettings>): Promise<void> {
	for (const [key, value] of Object.entries(patch)) {
		await db
			.insert(schema.setting)
			.values({ key, value })
			.onConflictDoUpdate({
				target: schema.setting.key,
				set: { value, updatedAt: sql`(CURRENT_TIMESTAMP)` }
			});
	}
}

/**
 * Guard for Shopify-touching server endpoints. Throws 403 when the integration
 * is disabled so a stale client or direct request can't push/import.
 */
export async function assertSyncEnabled(db: DbClient): Promise<void> {
	const { syncEnabled } = await getSettings(db);
	if (!syncEnabled) {
		error(403, 'Shopify sync is disabled in settings.');
	}
}
