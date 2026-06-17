import { and, eq, getTableColumns } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;

	const author = await db.query.metaobject.findFirst({
		where: and(
			eq(schema.metaobject.type, 'author'),
			eq(schema.metaobject.handle, params.handle)
		)
	});
	if (!author || !schema.isAuthor(author) || author.status !== 'Active') {
		error(404, 'Författaren hittades inte');
	}

	// Portrait (lowest-position media row for this metaobject)
	const [portrait] = await db
		.select({
			r2Key: schema.media.r2Key,
			migratedToR2: schema.media.migratedToR2,
			shopifyUrl: schema.media.shopifyUrl,
			altText: schema.media.altText
		})
		.from(schema.media)
		.where(
			and(
				eq(schema.media.entityType, 'metaobject'),
				eq(schema.media.entityId, String(author.id))
			)
		)
		.orderBy(schema.media.position)
		.limit(1);

	// Books by this author
	const books = await db
		.select(getTableColumns(schema.product))
		.from(schema.product)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.productsToMetaobjects.productId, schema.product.id)
		)
		.where(
			and(
				eq(schema.productsToMetaobjects.metaobjectId, author.id),
				eq(schema.productsToMetaobjects.relationType, 'author'),
				eq(schema.product.status, 'Active')
			)
		)
		.orderBy(schema.product.title);

	return {
		author,
		portrait: portrait ?? null,
		books: await attachCovers(db, books)
	};
};
