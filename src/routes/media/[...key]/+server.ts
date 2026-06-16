import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Serves owned media bytes straight from the R2 `MEDIA` bucket, so images are
 * delivered from this app's own domain instead of cdn.shopify.com. The `key`
 * is the object's `r2_key` (e.g. `product/123/456.jpg`).
 *
 * Keys are content-stable (one per media row; replacing an image writes a NEW
 * key), so responses are cached immutably. Cloudflare image resizing can be
 * layered on top later via /cdn-cgi/image once a custom domain is bound.
 */
export const GET: RequestHandler = async ({ params, platform, request }) => {
	const bucket = platform?.env.MEDIA;
	if (!bucket) error(503, 'Media storage not available');

	const key = params.key;
	if (!key) error(404, 'Not found');

	// With `onlyIf`, get() returns: a body object (condition passed), a bodyless
	// R2Object (condition failed → 304), or null (object missing).
	const obj = await bucket.get(key, {
		onlyIf: { etagDoesNotMatch: request.headers.get('if-none-match') ?? undefined }
	});
	if (!obj) error(404, 'Not found');

	const headers = new Headers();
	if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType);
	headers.set('etag', obj.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');

	if (!('body' in obj)) {
		return new Response(null, { status: 304, headers });
	}

	headers.set('content-length', String(obj.size));
	return new Response(obj.body as unknown as ReadableStream, { headers });
};
