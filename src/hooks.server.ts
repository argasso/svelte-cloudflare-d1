import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { createD1Database, createLibSQLDatabase, type DbClient } from '$lib/server/db';
import { verifyAccessJwt } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

/**
 * Database initialization hook
 * Chooses between D1 (Cloudflare) and LibSQL (local) based on environment
 */
const handleDatabase: Handle = async ({ event, resolve }) => {
	// Cloudflare environment (production/preview)
	if (event.platform?.env.DB) {
		event.locals.db = createD1Database(event.platform.env.DB) as unknown as DbClient;;
	}
	// Local development
	else if (env.DATABASE_URL) {
		event.locals.db = createLibSQLDatabase(env.DATABASE_URL) as unknown as DbClient;
	} else {
		console.warn('⚠️  No database configured. Set DATABASE_URL or deploy to Cloudflare.');
	}

	return resolve(event);
};

/**
 * Authentication for /admin via Cloudflare Access (fail-closed).
 *
 * `vite dev` bypasses. Otherwise (deployed, or `wrangler pages dev`) a valid
 * Access JWT is required — anything else is 403. The /webhooks route is outside
 * /admin and is authenticated by its HMAC.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/admin')) {
		if (dev) {
			// Local development (vite dev) — bypass
			event.locals.user = { email: 'dev@local', name: 'Developer' };
		} else {
			const user = await verifyAccessJwt(
				event.request.headers.get('cf-access-jwt-assertion'),
				env.CF_ACCESS_TEAM_DOMAIN,
				env.CF_ACCESS_AUD
			);
			if (!user) return new Response('Forbidden', { status: 403 });
			event.locals.user = user;
		}
	}

	return resolve(event);
};

export const handle = sequence(handleDatabase, handleAuth);
