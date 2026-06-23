/**
 * Cloudflare Access authentication for the admin area.
 *
 * Cloudflare Access authenticates the user at the edge and forwards a signed JWT
 * in the `Cf-Access-Jwt-Assertion` header (on Access-covered paths) and the
 * `CF_Authorization` cookie (domain-wide once authenticated). We verify it
 * against the team's public keys and the application audience (AUD).
 *
 * Reading the cookie matters for remote functions: SvelteKit serves `command()`
 * /`query()` from `/_app/remote/...`, which isn't under `/admin`, so the header
 * isn't injected there — but the cookie is. `requireAdmin()` guards those.
 *
 * Config (env / Pages vars):
 *   CF_ACCESS_TEAM_DOMAIN — e.g. "argasso.cloudflareaccess.com"
 *   CF_ACCESS_AUD         — the Access application's audience tag
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';

export interface AuthUser {
	email: string;
}

let cache: { domain: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

function jwksFor(teamDomain: string) {
	if (cache?.domain !== teamDomain) {
		cache = {
			domain: teamDomain,
			jwks: createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
		};
	}
	return cache.jwks;
}

/**
 * Verify a Cloudflare Access JWT. Returns the user on success, or null on a
 * missing/invalid token or missing config — callers must treat null as "deny".
 */
export async function verifyAccessJwt(
	token: string | null,
	teamDomain: string | undefined,
	aud: string | undefined
): Promise<AuthUser | null> {
	if (!token || !teamDomain || !aud) return null;
	try {
		const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
			issuer: `https://${teamDomain}`,
			audience: aud
		});
		return payload.email ? { email: String(payload.email) } : null;
	} catch {
		return null;
	}
}

/** The Access JWT from the header (Access-covered paths) or cookie (domain-wide). */
function accessToken(event: RequestEvent): string | null {
	return event.request.headers.get('cf-access-jwt-assertion') ?? event.cookies.get('CF_Authorization') ?? null;
}

/**
 * Cloudflare Access login URL for the current host, returning the user to the
 * requested path after login. Null when no team domain is configured (e.g. dev).
 * Used to redirect an unauthenticated /admin navigation into the Access login
 * flow instead of returning a bare 403.
 */
export function accessLoginUrl(event: RequestEvent): string | null {
	const team = env.CF_ACCESS_TEAM_DOMAIN;
	if (!team) return null;
	const redirectTo = event.url.pathname + event.url.search;
	return `https://${team}/cdn-cgi/access/login/${event.url.host}?redirect_url=${encodeURIComponent(redirectTo)}`;
}

/** Authenticate a request. Dev bypasses; otherwise requires a valid Access JWT. */
export async function authenticate(event: RequestEvent): Promise<AuthUser | null> {
	if (dev) return { email: 'dev@local' };
	return verifyAccessJwt(accessToken(event), env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
}

/**
 * Guard admin-only server code (e.g. command/query remote functions).
 * Returns 401 (not 403) on a missing/expired token so the client can tell
 * "re-authenticate" apart from a genuine "forbidden" (403) and reload to
 * re-trigger Cloudflare Access login.
 */
export async function requireAdmin(event: RequestEvent): Promise<AuthUser> {
	const user = await authenticate(event);
	if (!user) error(401, 'Unauthorized');
	return user;
}
