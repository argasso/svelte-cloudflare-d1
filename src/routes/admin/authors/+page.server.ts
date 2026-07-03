import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

const bookCount = sql<number>`count(${schema.productsToMetaobjects.productId})`;

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;

	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const sort = url.searchParams.get('sort') ?? 'titel-asc';
	const orderBy =
		sort === 'titel-desc'
			? sql`${schema.metaobject.title} desc`
			: sort === 'flest-bocker'
				? sql`${bookCount} desc, ${schema.metaobject.title} asc`
				: sql`${schema.metaobject.title} asc`;

	const authors = await db
		.select({ ...getTableColumns(schema.metaobject), bookCount })
		.from(schema.metaobject)
		.leftJoin(
			schema.productsToMetaobjects,
			and(
				eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId),
				eq(schema.productsToMetaobjects.relationType, 'author')
			)
		)
		.where(
			and(
				eq(schema.metaobject.type, 'author'),
				q
					? sql`(lower(coalesce(${schema.metaobject.title}, '')) like ${'%' + q + '%'} or lower(${schema.metaobject.handle}) like ${'%' + q + '%'})`
					: undefined
			)
		)
		.groupBy(schema.metaobject.id)
		.orderBy(orderBy);

	const total = await db.$count(schema.metaobject, eq(schema.metaobject.type, 'author'));

	return { authors, total, shown: authors.length, q };
};
