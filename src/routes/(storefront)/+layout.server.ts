import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { buildPageNav } from '$lib/server/storefront/nav';

export const load: LayoutServerLoad = async ({ locals }) => {
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

	return { nav: buildPageNav(pages) };
};
