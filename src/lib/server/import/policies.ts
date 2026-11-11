/**
 * Import Shopify shop policies (Terms of Service, Privacy Policy) into D1.
 *
 * Uses the STOREFRONT API: policies are public there, whereas the Admin API
 * gates them behind the `read_legal_policies` scope the app's token lacks. The
 * body is ready-to-render HTML (no Liquid in this shop's policies — verified),
 * so we store it verbatim and sanitise at render time.
 *
 * Inbound-only (edited in Shopify, never pushed back). Upserts by `type`, so a
 * re-import simply refreshes the stored copy.
 */
import { gql } from '@urql/core';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { createStorefrontClient } from '$lib/shopify/storefront-client';

/** Storefront `shop` policy field → our stable type + storefront route handle. */
const POLICY_SOURCES = [
	{ field: 'termsOfService', type: 'termsOfService', handle: 'forsaljningsvillkor' },
	{ field: 'privacyPolicy', type: 'privacyPolicy', handle: 'integritetspolicy' }
] as const;

type ShopPolicy = { id: string; title: string; body: string } | null;

const SHOP_POLICIES = gql`
	query ShopPolicies {
		shop {
			termsOfService {
				id
				title
				body
			}
			privacyPolicy {
				id
				title
				body
			}
		}
	}
`;

export async function importPolicies(
	token: string,
	db: DbClient
): Promise<{ imported: number; skipped: number }> {
	const c = createStorefrontClient(token);
	const r = await c
		.query<{ shop: Record<string, ShopPolicy> }>(SHOP_POLICIES, {})
		.toPromise();
	if (r.error) throw new Error(`Shopify policy read failed: ${r.error.message}`);

	const shop = r.data?.shop;
	if (!shop) return { imported: 0, skipped: 0 };

	const now = new Date().toISOString();
	let imported = 0;
	let skipped = 0;

	for (const src of POLICY_SOURCES) {
		const p = shop[src.field];
		if (!p?.body) {
			skipped++;
			continue;
		}
		await db
			.insert(schema.policy)
			.values({
				type: src.type,
				handle: src.handle,
				title: p.title,
				body: p.body,
				shopifyId: p.id,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: schema.policy.type,
				set: {
					handle: src.handle,
					title: p.title,
					body: p.body,
					shopifyId: p.id,
					updatedAt: now
				}
			});
		imported++;
	}

	return { imported, skipped };
}
