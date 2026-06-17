import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	const authors = await db
		.select({
			id: schema.metaobject.id,
			title: schema.metaobject.title,
			handle: schema.metaobject.handle
		})
		.from(schema.metaobject)
		.where(and(eq(schema.metaobject.type, 'author'), eq(schema.metaobject.status, 'Active')))
		.orderBy(schema.metaobject.title);

	return { authors: await attachCovers(db, authors, 'metaobject') };
};
