import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Database, DbClient } from '$lib/server/db';

declare global {
	namespace App {
		interface Locals {
			db: DbClient;
			user?: {
				email: string;
				name?: string;
			};
		}
		interface Platform {
			env: {
				DB: D1Database;
				MEDIA: R2Bucket;
				SHOPIFY_SHOP?: string;
				SHOPIFY_API_VERSION?: string;
				SHOPIFY_ADMIN_ACCESS_TOKEN?: string;
				SHOPIFY_STOREFRONT_ACCESS_TOKEN?: string;
				SHOPIFY_WEBHOOK_SECRET?: string;
				CF_ACCESS_TEAM_DOMAIN?: string;
				CF_ACCESS_AUD?: string;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
