/**
 * Cloudflare Access JWT verification for the /admin area.
 *
 * Cloudflare Access (Zero Trust) authenticates the user at the edge and forwards
 * a signed JWT in the `Cf-Access-Jwt-Assertion` header. We verify it against the
 * team's public keys and check the application audience (AUD) tag.
 *
 * Config (env / Pages vars):
 *   CF_ACCESS_TEAM_DOMAIN — e.g. "argasso.cloudflareaccess.com"
 *   CF_ACCESS_AUD         — the Access application's audience tag
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

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
