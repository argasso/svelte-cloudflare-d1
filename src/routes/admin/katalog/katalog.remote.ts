import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import * as schema from '$lib/db/schema';
import { requireAdmin } from '$lib/server/auth';
import { getSettings, updateSettings } from '$lib/server/settings';

/**
 * Upload a new PDF catalogue to R2 under `catalogue/<uuid>-<filename>`. Records
 * its metadata in the `setting` table (key: `catalogue`) so the storefront
 * download button resolves to the current version. Replacing writes a new key
 * (content-stable URLs = infinite cache) and deletes the old object.
 */
export const uploadCatalogue = form(
	v.object({
		file: v.pipe(
			v.file('Välj en PDF-fil'),
			v.mimeType(['application/pdf'], 'Filen måste vara PDF'),
			v.maxSize(50 * 1024 * 1024, 'PDF får vara max 50 MB')
		)
	}),
	async ({ file }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const bucket = event.platform?.env.MEDIA;
		if (!bucket) error(503, 'Media storage (R2 bucket MEDIA) is not available.');

		const db = event.locals.db;
		const previous = (await getSettings(db)).catalogue;

		const safeName = (file.name || 'catalogue.pdf').replace(/[^\w.\-]+/g, '-');
		const key = `catalogue/${crypto.randomUUID()}-${safeName}`;
		const buf = await file.arrayBuffer();
		await bucket.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } });

		await updateSettings(db, {
			catalogue: {
				r2Key: key,
				filename: safeName,
				sizeBytes: buf.byteLength,
				uploadedAt: new Date().toISOString()
			}
		});

		if (previous?.r2Key) await bucket.delete(previous.r2Key).catch(() => {});

		return { success: true, filename: safeName };
	}
);

/** Remove the current catalogue (from R2 + settings). */
export const removeCatalogue = form(v.object({}), async () => {
	const event = getRequestEvent();
	await requireAdmin(event);
	const db = event.locals.db;
	const bucket = event.platform?.env.MEDIA;

	const current = (await getSettings(db)).catalogue;
	if (current && bucket) await bucket.delete(current.r2Key).catch(() => {});
	await updateSettings(db, { catalogue: null });
	return { success: true };
});

const status = v.picklist(['pending', 'sent', 'cancelled']);

/** Mark a print catalogue request as sent/cancelled/pending. */
export const setRequestStatus = form(
	v.object({
		id: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number)),
		status
	}),
	async ({ id, status }) => {
		const event = getRequestEvent();
		await requireAdmin(event);
		const db = event.locals.db;
		const now = new Date().toISOString();
		await db
			.update(schema.catalogueRequest)
			.set({
				status,
				sentAt: status === 'sent' ? now : null,
				updatedAt: now
			})
			.where(eq(schema.catalogueRequest.id, id));
		return { success: true };
	}
);
