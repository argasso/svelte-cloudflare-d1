/**
 * Image source resolution + Cloudflare Image Transformations URL builder.
 *
 * Owned images live in R2 and are served from `/media/<r2Key>` (this app's own
 * domain). Until a media row is backfilled into R2, we fall back to its Shopify
 * CDN URL. `mediaSource` picks the right raw source; `cfImage` optionally wraps
 * it in a `/cdn-cgi/image/<options>/<source>` URL for edge resize/optimization.
 *
 * Transformations need the feature enabled on a CUSTOM DOMAIN (not *.pages.dev),
 * so whether to emit transform URLs is decided per-request (see the storefront
 * layout load: master env switch + host check) and passed in as `enabled`. Keep
 * the variant set SMALL and fixed: Cloudflare bills per unique (image × options)
 * per ~30 days, so reusing these few keeps usage low.
 */
export type ImageVariant = 'thumb' | 'card' | 'detail' | 'full';

const VARIANTS: Record<ImageVariant, string> = {
	thumb: 'width=150,height=150,fit=cover,format=auto',
	card: 'width=400,format=auto',
	detail: 'width=800,format=auto',
	full: 'width=1600,format=auto'
};

/** The fields of a media row needed to resolve its best source URL. */
export type MediaSource = {
	r2Key?: string | null;
	migratedToR2?: boolean | null;
	shopifyUrl?: string | null;
};

/**
 * Best raw source for a media row: the owned R2 path once backfilled, otherwise
 * the Shopify CDN URL. Returns '' when neither is available.
 */
export function mediaSource(media: MediaSource | null | undefined): string {
	if (!media) return '';
	if (media.migratedToR2 && media.r2Key) return `/media/${media.r2Key}`;
	return media.shopifyUrl ?? '';
}

/**
 * Transformed delivery URL for an image source, or the raw source when
 * `enabled` is false. `enabled` is decided per-request (custom domain only).
 */
export function cfImage(
	src: string | null | undefined,
	variant: ImageVariant = 'card',
	enabled = false
): string {
	if (!src) return '';
	if (!enabled) return src;
	// /cdn-cgi/image takes either an absolute URL or a same-origin path with no
	// leading slash; strip it so a local `/media/...` source doesn't double up.
	const source = src.startsWith('/') ? src.slice(1) : src;
	return `/cdn-cgi/image/${VARIANTS[variant]}/${source}`;
}

/** Convenience: resolve a media row straight to a (optionally transformed) URL. */
export function mediaImage(
	media: MediaSource | null | undefined,
	variant: ImageVariant = 'card',
	enabled = false
): string {
	return cfImage(mediaSource(media), variant, enabled);
}
