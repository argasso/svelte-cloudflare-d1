import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { sanitizePolicyHtml } from '$lib/server/sanitize';

/**
 * Load a mirrored Shopify shop policy by its stable type (e.g. 'termsOfService')
 * and return render-ready HTML. The `body` is sanitised before it reaches
 * `{@html}`. 404 if the policy hasn't been imported yet.
 */
export async function loadPolicy(db: DbClient, type: string): Promise<{ bodyHtml: string }> {
	const [row] = await db
		.select({ body: schema.policy.body })
		.from(schema.policy)
		.where(eq(schema.policy.type, type))
		.limit(1);
	if (!row) error(404, 'Sidan hittades inte');
	return { bodyHtml: sanitizePolicyHtml(row.body) };
}
