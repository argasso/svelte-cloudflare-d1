import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/svg+xml': 'svg'
};

/** Pick a file extension from the source URL, falling back to the content type. */
function extFor(url: string, contentType: string | null): string {
	try {
		const m = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
		if (m) return m[1].toLowerCase();
	} catch {
		// not a parseable URL — fall through to mime
	}
	if (contentType && EXT_BY_MIME[contentType]) return EXT_BY_MIME[contentType];
	return 'bin';
}

/** Deterministic R2 key for a media row, e.g. `product/123/456.jpg`. */
export function r2KeyFor(
	media: { entityType: string; entityId: string; id: number },
	ext: string
): string {
	return `${media.entityType}/${media.entityId}/${media.id}.${ext}`;
}

/** A media row still sourced from Shopify (not yet copied into R2). */
const pendingFilter = and(
	or(eq(schema.media.migratedToR2, false), isNull(schema.media.migratedToR2)),
	isNotNull(schema.media.shopifyUrl)
);

export type MediaMigrationResult = {
	migrated: number;
	failed: number;
	remaining: number;
	errors: string[];
};

/**
 * Copy a bounded batch of Shopify-hosted images into R2 and flip the rows to
 * owned (`r2_key` + `migrated_to_r2`). Bounded per call so it stays within the
 * Workers per-request subrequest limit — the caller loops until `remaining` is 0.
 * Idempotent: already-migrated rows are skipped by the filter.
 */
export async function migrateMediaBatch(
	db: DbClient,
	bucket: R2Bucket,
	limit = 25
): Promise<MediaMigrationResult> {
	const pending = await db.select().from(schema.media).where(pendingFilter).limit(limit);

	let migrated = 0;
	let failed = 0;
	const errors: string[] = [];

	for (const m of pending) {
		try {
			const res = await fetch(m.shopifyUrl!);
			if (!res.ok) throw new Error(`fetch ${res.status}`);
			const contentType = res.headers.get('content-type');
			const buf = await res.arrayBuffer();
			const key = r2KeyFor(m, extFor(m.shopifyUrl!, contentType));

			await bucket.put(key, buf, {
				httpMetadata: { contentType: contentType ?? 'application/octet-stream' }
			});

			await db
				.update(schema.media)
				.set({
					r2Key: key,
					migratedToR2: true,
					fileSize: buf.byteLength,
					mimeType: contentType ?? null,
					updatedAt: new Date().toISOString()
				})
				.where(eq(schema.media.id, m.id));

			migrated++;
		} catch (e) {
			failed++;
			errors.push(`media ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	const remaining = await db.$count(schema.media, pendingFilter);
	return { migrated, failed, remaining, errors };
}
