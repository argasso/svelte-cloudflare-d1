import { and, eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;

	let product = await db.query.product.findFirst({
		where: eq(schema.product.handle, params.handle),
		with: { variants: { with: { metafields: true } } }
	});

	// Backward-compat: old /bok/<numeric id> links → permanent redirect to the handle.
	if (!product && /^\d+$/.test(params.handle)) {
		const byId = await db.query.product.findFirst({
			where: eq(schema.product.id, Number(params.handle)),
			columns: { handle: true, status: true }
		});
		if (byId?.handle && byId.status === 'Active') redirect(301, `/bok/${byId.handle}`);
	}

	if (!product || product.status !== 'Active') error(404, 'Boken hittades inte');
	const id = product.id;

	// Optional edition segment: /bok/<handle>/<isbn> preselects the matching
	// variant (ISBN lives in sku as digits / barcode with hyphens). Compare on
	// digits only; unknown ISBN just falls back to the default variant.
	const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
	const selectedVariantId =
		params.isbn != null
			? (product.variants.find(
					(v) => digits(v.sku) === digits(params.isbn) || digits(v.barcode) === digits(params.isbn)
				)?.id ?? null)
			: null;

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

	return { product, media, authors, selectedVariantId };
};
