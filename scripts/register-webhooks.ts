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
const PRODUCT_TOPICS = ['PRODUCTS_UPDATE', 'PRODUCTS_CREATE'] as const;
const METAOBJECT_TOPICS = ['METAOBJECTS_UPDATE', 'METAOBJECTS_CREATE'] as const;
// Metaobject webhooks are scoped per definition; we only care about these types.
const METAOBJECT_TYPES = ['page', 'author'];

const Create = graphqlAdmin(`mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
	webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
		webhookSubscription { id }
		userErrors { field message }
	}
}`);

const Definitions = graphqlAdmin(`query MetaobjectDefs {
	metaobjectDefinitions(first: 50) { nodes { id type } }
}`);

const client = createAdminClient(TOKEN);

type Sub = { callbackUrl: string; format: 'JSON'; filter?: string };

async function register(label: string, topic: string, sub: Sub) {
	const r = await client.mutation(Create, { topic, sub }).toPromise();
	if (r.error) {
		console.log(`  ✗ ${label}: ${r.error.message}`);
		return;
	}
	const errs = r.data?.webhookSubscriptionCreate?.userErrors ?? [];
	if (errs.length) {
		// Duplicate topic+uri+filter shows up here; treat as already-registered
		console.log(`  • ${label}: ${errs.map((e) => e.message).join('; ')}`);
	} else {
		console.log(`  ✓ ${label}: ${r.data?.webhookSubscriptionCreate?.webhookSubscription?.id}`);
	}
}

async function main() {
	console.log(`Registering webhooks → ${callbackUrl}\n`);

	for (const topic of PRODUCT_TOPICS) {
		await register(topic, topic, { callbackUrl, format: 'JSON' });
	}

	// Resolve the metaobject definition ids for the types we sync.
	const defsRes = await client.query(Definitions, {}).toPromise();
	const defs = (defsRes.data?.metaobjectDefinitions?.nodes ?? []).filter((d) =>
		METAOBJECT_TYPES.includes(d.type)
	);
	for (const topic of METAOBJECT_TOPICS) {
		for (const def of defs) {
			await register(`${topic} [${def.type}]`, topic, {
				callbackUrl,
				format: 'JSON',
				filter: `type:${def.type}`
			});
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
