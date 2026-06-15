import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import * as v from 'valibot';
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
		const db = getRequestEvent().locals.db;
		const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
		if (!token) error(500, 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.');

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
				const r = await linkProducts(db);
				return { step, imported: r.linked, skipped: 0, next: null, cursor: null };
			}
		}
	}
);
