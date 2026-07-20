import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	const productId = parseInt(params.id);

	// Get product with variants and their metafields
	const product = await db.query.product.findFirst({
		where: eq(schema.product.id, productId),
		with: {
			variants: {
				with: {
					metafields: true
				}
			},
			metafields: true
		}
	});

	if (!product) {
		error(404, 'Product not found');
	}

	// Get linked metaobjects (categories and authors). Order by position so the
	// authors render in their stored order — the save handler compares the
	// submitted author order against the stored order to decide dirtiness, so an
	// unordered load would make an untouched product look perpetually changed.
	const linkedMetaobjects = await db
		.select({
			metaobject: schema.metaobject,
			relationType: schema.productsToMetaobjects.relationType
		})
		.from(schema.metaobject)
		.innerJoin(
			schema.productsToMetaobjects,
			eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId)
		)
		.where(eq(schema.productsToMetaobjects.productId, productId))
		.orderBy(schema.productsToMetaobjects.position);

	const authors = linkedMetaobjects.filter((m) => m.metaobject.type === 'author');

	// Product images (R2-owned or Shopify-sourced) for the media manager
	const media = await db
		.select()
		.from(schema.media)
		.where(
			and(
				eq(schema.media.entityType, 'product'),
				eq(schema.media.entityId, String(productId))
			)
		)
		.orderBy(schema.media.position);

	// Categories and authors are searched on demand via remotes (too many to
	// ship). allCategories is still loaded to resolve each variant's stored
	// book.category gids back to {id, title} for the picker's initial value.
	const allCategories = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'))
		.orderBy(schema.metaobject.title);

	return {
		product,
		media,
		authors: authors || [],
		allCategories: allCategories || []
	};
};
