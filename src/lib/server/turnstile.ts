/**
 * Cloudflare Turnstile server-side verification. The widget renders on the
 * client with `PUBLIC_TURNSTILE_SITE_KEY`; on submit the client posts a
 * `cf-turnstile-response` token that we exchange here for a pass/fail.
 *
 * Env: TURNSTILE_SECRET_KEY (secret binding). When unset, verification passes
 * transparently so local dev doesn't need a live secret.
 */
import { env } from '$env/dynamic/private';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string | null, remoteIp?: string | null): Promise<boolean> {
	// Local dev / preview without a secret: skip verification instead of failing
	// closed (the widget isn't shown in that case either).
	if (!env.TURNSTILE_SECRET_KEY) return true;
	if (!token) return false;

	const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const r = await fetch(VERIFY_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		const data = (await r.json()) as { success?: boolean };
		return !!data.success;
	} catch (e) {
		console.error('turnstile verify failed', e);
		return false;
	}
}
