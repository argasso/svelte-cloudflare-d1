import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth';
import { migrateMediaBatch } from '$lib/server/media';

/**
 * Copy one batch of Shopify-hosted images into R2. The client loops this until
 * `remaining` is 0 (bounded per call to respect the Workers subrequest limit).
 * Served from /_app/remote, so it self-guards with requireAdmin.
 */
export const runMediaMigrationStep = command(
	v.object({ limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 25) }),
	async ({ limit }) => {
		const event = getRequestEvent();
		await requireAdmin(event);

		const bucket = event.platform?.env.MEDIA;
		if (!bucket) error(503, 'Media storage (R2 bucket MEDIA) is not available.');

		return migrateMediaBatch(event.locals.db, bucket, limit);
	}
);
