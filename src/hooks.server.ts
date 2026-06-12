import { sequence } from '@sveltejs/kit/hooks';
import { createD1Database, createLibSQLDatabase, type DbClient } from '$lib/server/db';
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
 * Authentication hook (placeholder - will implement Cloudflare Access later)
*/
const handleAuth: Handle = async ({ event, resolve }) => {
	// TODO: Implement Cloudflare Access JWT verification
	// For now, in local dev, bypass auth
	if (event.url.pathname.startsWith('/admin')) {
		if (!event.platform) {
			// Local development - bypass auth
			event.locals.user = { email: 'dev@local', name: 'Developer' };
		}
		// TODO: Add Cloudflare Access JWT verification here
	}

	return resolve(event);
};

export const handle = sequence(handleDatabase, handleAuth);
