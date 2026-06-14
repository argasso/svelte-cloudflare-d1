#!/usr/bin/env tsx
/**
 * Register Shopify webhook subscriptions pointing at our /webhooks/shopify
 * endpoint. Run after deploying, with the public callback base URL.
 *
 * Shopify signs these webhooks with the app's secret — set SHOPIFY_WEBHOOK_SECRET
 * to that secret so the handler can verify the HMAC.
 *
 * Usage:
 *   SHOPIFY_WEBHOOK_CALLBACK_URL=https://your-app.pages.dev npm run register-webhooks
 *   npm run register-webhooks -- https://your-app.pages.dev
 */
import { createAdminClient } from '../src/lib/shopify/admin-client';
import { graphqlAdmin } from '../src/lib/graphql-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const base = process.argv[2] || process.env.SHOPIFY_WEBHOOK_CALLBACK_URL;

if (!TOKEN) {
	console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN not set');
	process.exit(1);
}
if (!base) {
	console.error('❌ Provide the callback base URL (arg or SHOPIFY_WEBHOOK_CALLBACK_URL)');
	process.exit(1);
}

const callbackUrl = `${base.replace(/\/$/, '')}/webhooks/shopify`;

// Topics that mirror what the sync pushes, so D1 stays current with Shopify edits.
const TOPICS = [
	'PRODUCTS_UPDATE',
	'PRODUCTS_CREATE',
	'METAOBJECTS_UPDATE',
	'METAOBJECTS_CREATE'
] as const;

const Create = graphqlAdmin(`mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
	webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
		webhookSubscription { id }
		userErrors { field message }
	}
}`);

const client = createAdminClient(TOKEN);

async function main() {
	console.log(`Registering webhooks → ${callbackUrl}\n`);
	for (const topic of TOPICS) {
		const r = await client
			.mutation(Create, { topic, sub: { callbackUrl, format: 'JSON' } })
			.toPromise();
		if (r.error) {
			console.log(`  ✗ ${topic}: ${r.error.message}`);
			continue;
		}
		const errs = r.data?.webhookSubscriptionCreate?.userErrors ?? [];
		if (errs.length) {
			// Duplicate topic+uri shows up here; treat as already-registered
			console.log(`  • ${topic}: ${errs.map((e) => e.message).join('; ')}`);
		} else {
			console.log(`  ✓ ${topic}: ${r.data?.webhookSubscriptionCreate?.webhookSubscription?.id}`);
		}
	}
	console.log('\nDone.');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
