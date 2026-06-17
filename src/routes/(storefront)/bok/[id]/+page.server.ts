import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	const id = parseInt(params.id);
	if (Number.isNaN(id)) error(404, 'Boken hittades inte');

	const product = await db.query.product.findFirst({
		where: eq(schema.product.id, id),
		with: { variants: { with: { metafields: true } } }
	});
	if (!product || product.status !== 'Active') error(404, 'Boken hittades inte');

	// Product images (gallery); a variant's image is one of these (variant.imageId)
	const media = await db
		.select()
		.from(schema.media)
		.where(and(eq(schema.media.entityType, 'product'), eq(schema.media.entityId, String(id))))
		.orderBy(schema.media.position);

	const authors = await db
		.select({
			id: schema.metaobject.id,
			title: schema.metaobject.title,
			handle: schema.metaobject.handle
		})
		.from(schema.metaobject)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId)
		)
		.where(
			and(
				eq(schema.productsToMetaobjects.productId, id),
				eq(schema.productsToMetaobjects.relationType, 'author')
			)
		);

	return { product, media, authors };
};
