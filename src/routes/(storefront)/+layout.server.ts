import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { buildPageNav } from '$lib/server/storefront/nav';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Cloudflare Image Transformations only work on a custom domain with the
	// feature enabled — not on *.pages.dev or locally. Master switch
	// (PUBLIC_IMAGE_TRANSFORMATIONS) AND a host check, decided per request.
	const host = url.host;
	const imageTransforms =
		env.PUBLIC_IMAGE_TRANSFORMATIONS === 'true' &&
		!host.endsWith('.pages.dev') &&
		!host.startsWith('localhost') &&
		!host.startsWith('127.0.0.1');

	const pages = await locals.db
		.select({
			id: schema.metaobject.id,
			handle: schema.metaobject.handle,
			title: schema.metaobject.title,
			status: schema.metaobject.status,
			parentId: schema.metaobject.parentId,
			position: schema.metaobject.position,
			fields: schema.metaobject.fields
		})
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'));

	return { nav: buildPageNav(pages), imageTransforms };
};
