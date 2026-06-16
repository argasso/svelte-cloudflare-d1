import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-valibot';
import { commonColumns } from '../utils';

/**
 * App-wide runtime settings as a key/value store. One row per setting key; the
 * value is JSON so a key can hold a flag, string, or object. Read/merged over
 * typed defaults by `getSettings` in `$lib/server/settings`. This is what makes
 * the Shopify integration toggleable from the settings page at runtime (no
 * redeploy), unlike env-based flags.
 */
export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull(),
	...commonColumns
});

export const settingInsertSchema = createInsertSchema(setting);
export const settingSelectSchema = createSelectSchema(setting);

export type Setting = typeof setting.$inferSelect;
export type SettingInsert = typeof setting.$inferInsert;
