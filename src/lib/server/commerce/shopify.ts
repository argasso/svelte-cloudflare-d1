import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { importMetaobjects, importProductPage, linkProducts } from '$lib/server/import';
import { applySync, createShopifyGateway } from '$lib/server/sync';
import { handleWebhook, verifyShopifyHmac } from '$lib/server/sync/webhook';
import { revertMetaobjectFromShopify, revertProductFromShopify } from '$lib/server/sync/revert';
import type { CatalogSync, ImportStep, ImportStepResult, PushResult } from './types';

function token(): string {
	const t = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
	if (!t) error(500, 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.');
	return t;
}

/** Shopify catalog provider: import (pull), push, and inbound webhooks. */
export const shopifyCatalog: CatalogSync = {
	id: 'shopify',
	get enabled() {
		return !!env.SHOPIFY_ADMIN_ACCESS_TOKEN;
	},

	async importStep(db, step, cursor): Promise<ImportStepResult> {
		const t = token();
		switch (step) {
			case 'authors': {
				const r = await importMetaobjects(t, db, 'author');
				return { step, imported: r.imported, skipped: r.skipped, next: 'pages', cursor: null };
			}
			case 'pages': {
				const r = await importMetaobjects(t, db, 'page');
				return { step, imported: r.imported, skipped: r.skipped, next: 'products', cursor: null };
			}
			case 'products': {
				const r = await importProductPage(t, db, cursor ?? null);
				return {
					step,
					imported: r.imported,
					skipped: r.skipped,
					next: r.nextCursor ? 'products' : 'links',
					cursor: r.nextCursor
				};
			}
			case 'links': {
				const r = await linkProducts(db, cursor ? Number(cursor) : 0);
				return {
					step,
					imported: r.linked,
					skipped: 0,
					next: r.nextCursor != null ? 'links' : null,
					cursor: r.nextCursor != null ? String(r.nextCursor) : null
				};
			}
		}
	},

	async revert(db, { type, id }): Promise<void> {
		if (type === 'product') await revertProductFromShopify(db, id, token());
		else await revertMetaobjectFromShopify(db, id, token());
	},

	async push(db, { filter, baseUrl }): Promise<PushResult> {
		const results = await applySync(db, createShopifyGateway(token()), { apply: true, filter, baseUrl });
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
	},

	async receiveWebhook(db: DbClient, request: Request): Promise<Response> {
		const secret = env.SHOPIFY_WEBHOOK_SECRET;
		if (!secret) return new Response('webhook secret not configured', { status: 500 });

		const raw = await request.text();
		const valid = await verifyShopifyHmac(raw, request.headers.get('x-shopify-hmac-sha256'), secret);
		if (!valid) return new Response('invalid hmac', { status: 401 });

		const topic = request.headers.get('x-shopify-topic') ?? '';
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			return new Response('invalid json', { status: 400 });
		}

		try {
			// Product SEO isn't in the REST payload; the handler fetches it via the token.
			const outcome = await handleWebhook(db, topic, payload, env.SHOPIFY_ADMIN_ACCESS_TOKEN);
			await db.insert(schema.syncLog).values({
				entityType: outcome.entity === 'metaobject' ? 'metaobject' : 'product',
				entityId: 'id' in outcome ? outcome.id : topic,
				direction: 'shopify_to_d1',
				status: outcome.action === 'updated' ? 'success' : 'skipped',
				errorMessage: outcome.action === 'updated' ? null : outcome.reason,
				payload: { topic, outcome }
			});
			return new Response('ok');
		} catch (e) {
			console.error('webhook error', topic, e);
			return new Response('error', { status: 500 });
		}
	}
};
