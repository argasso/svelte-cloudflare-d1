import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { assertSyncEnabled } from '$lib/server/settings';
import { importMetaobjects, importProductPage, linkProducts } from '$lib/server/import';

/**
 * Run one step of the Shopify import. The client drives the sequence in order
 * (authors → pages → products page-by-page → links) and shows progress from
 * each step's return. Bounded per call so it stays within request limits.
 */
export const runImportStep = command(
	v.object({
		step: v.picklist(['authors', 'pages', 'products', 'links']),
		cursor: v.optional(v.string())
	}),
	async ({ step, cursor }) => {
		const event = getRequestEvent();
		// command() is served from /_app/remote, outside /admin, so the path-based
		// hook doesn't gate it — guard here (Access JWT via header or cookie).
		await requireAdmin(event);
		const db = event.locals.db;
		await assertSyncEnabled(db);
		const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
		if (!token) error(500, 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.');

		try {
			switch (step) {
				case 'authors': {
					const r = await importMetaobjects(token, db, 'author');
					return { step, imported: r.imported, skipped: r.skipped, next: 'pages' as const, cursor: null };
				}
				case 'pages': {
					const r = await importMetaobjects(token, db, 'page');
					return { step, imported: r.imported, skipped: r.skipped, next: 'products' as const, cursor: null };
				}
				case 'products': {
					const r = await importProductPage(token, db, cursor ?? null);
					return {
						step,
						imported: r.imported,
						skipped: r.skipped,
						next: (r.nextCursor ? 'products' : 'links') as 'products' | 'links',
						cursor: r.nextCursor
					};
				}
				case 'links': {
					const r = await linkProducts(db, cursor ? Number(cursor) : 0);
					return {
						step,
						imported: r.linked,
						skipped: 0,
						next: (r.nextCursor != null ? 'links' : null) as 'links' | null,
						cursor: r.nextCursor != null ? String(r.nextCursor) : null
					};
				}
			}
		} catch (e) {
			// Surface the real cause (the default remote-function error is opaque).
			const message = e instanceof Error ? e.message : String(e);
			console.error(`Import step "${step}" failed`, e);
			error(500, `Import step "${step}" failed: ${message}`);
		}
	}
);
