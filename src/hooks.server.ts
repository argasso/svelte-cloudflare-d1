import { sequence } from '@sveltejs/kit/hooks';
import { createD1Database, createLibSQLDatabase, type DbClient } from '$lib/server/db';
import { authenticate } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { Handle, HandleServerError } from '@sveltejs/kit';

/**
 * Database initialization hook
 * Chooses between D1 (Cloudflare) and LibSQL (local) based on environment
 */
const handleDatabase: Handle = async ({ event, resolve }) => {
	// Cloudflare environment (production/preview)
	if (event.platform?.env.DB) {
		event.locals.db = createD1Database(event.platform.env.DB) as unknown as DbClient;
	}
	// Local development
	else if (env.DATABASE_URL) {
		event.locals.db = (await createLibSQLDatabase(env.DATABASE_URL)) as unknown as DbClient;
	} else {
		// No database available — fail with a clear message instead of a cryptic
		// "Cannot read properties of undefined" when a load touches locals.db.
		console.error('No database configured: missing D1 binding `DB` and DATABASE_URL.');
		return new Response(
			'Database not available — the D1 binding `DB` is not configured for this deployment.',
			{ status: 503 }
		);
	}

	return resolve(event);
};

/**
 * Authentication for /admin via Cloudflare Access (fail-closed).
 *
 * `vite dev` bypasses (handled in authenticate). Otherwise a valid Access JWT
 * is required — anything else is 403. Admin command/query remote functions
 * (served from /_app/remote, outside /admin) guard themselves via requireAdmin.
 * The /webhooks route is outside /admin and is authenticated by its HMAC.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/admin')) {
		const user = await authenticate(event);
		if (!user) return new Response('Forbidden', { status: 403 });
		event.locals.user = user;
	}

	return resolve(event);
};

export const handle = sequence(handleDatabase, handleAuth);

/** Log uncaught server errors with request context (visible in Cloudflare logs). */
export const handleError: HandleServerError = ({ error, event }) => {
	console.error('Unhandled error on', event.url.pathname, error);
	return { message: 'Internal Error' };
};
