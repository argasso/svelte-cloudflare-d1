import { env } from '$env/dynamic/public';

/**
 * Cloudflare Image Transformations URL builder.
 *
 * Emits `/cdn-cgi/image/<options>/<source>` URLs so Shopify-hosted images are
 * resized/optimized (AVIF/WebP) and delivered from the edge. The source stays
 * on Shopify's CDN for now; only delivery goes through Cloudflare.
 *
 * Transformations must be enabled on the zone (requires a custom domain — not
 * available on *.pages.dev). Until then, set nothing and `cfImage` returns the
 * raw URL so the storefront still renders. Flip it on by setting
 * PUBLIC_IMAGE_TRANSFORMATIONS=true once the custom domain + feature are live.
 *
 * Keep the variant set SMALL and fixed: Cloudflare bills per unique
 * (image × options) per ~30 days, so reusing these few keeps usage low.
 */
export type ImageVariant = 'thumb' | 'card' | 'detail' | 'full';

const VARIANTS: Record<ImageVariant, string> = {
	thumb: 'width=150,height=150,fit=cover,format=auto',
	card: 'width=400,format=auto',
	detail: 'width=800,format=auto',
	full: 'width=1600,format=auto'
};

const enabled = env.PUBLIC_IMAGE_TRANSFORMATIONS === 'true';

/** Transformed delivery URL for an image, or the raw URL when transforms are off. */
export function cfImage(src: string | null | undefined, variant: ImageVariant = 'card'): string {
	if (!src) return '';
	if (!enabled) return src;
	return `/cdn-cgi/image/${VARIANTS[variant]}/${src}`;
}
