import { eq, sql } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
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

	// Get linked metaobjects (categories and authors)
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
		.where(eq(schema.productsToMetaobjects.productId, productId));

	const categories = linkedMetaobjects.filter((m) => m.metaobject.type === 'page');
	const authors = linkedMetaobjects.filter((m) => m.metaobject.type === 'author');

	// Get all available categories and authors for selection
	const allCategories = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'))
		.orderBy(schema.metaobject.title);

	const allAuthors = await db
		.select()
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'author'))
		.orderBy(schema.metaobject.title);

	return {
		product,
		categories: categories || [],
		authors: authors || [],
		allCategories: allCategories || [],
		allAuthors: allAuthors || []
	};
};

export const actions: Actions = {
	updateVariant: async ({ request, locals }) => {
		const db = locals.db;
		const formData = await request.formData();

		const variantId = formData.get('variantId') as string;
		const price = formData.get('price') ? parseFloat(formData.get('price') as string) : 0;
		const sku = formData.get('sku') as string;

		// Book metafields
		const binding = formData.get('binding') as string;
		const numberOfPages = formData.get('numberOfPages') as string;
		const age = formData.get('age') as string;
		const publishMonth = formData.get('publishMonth') as string;
		const readingLevel = formData.get('readingLevel') as string;
		const illustrationsBy = formData.get('illustrationsBy') as string;

		// Translated book metafields
		const originalTitle = formData.get('originalTitle') as string;
		const translatedBy = formData.get('translatedBy') as string;

		try {
			// Update variant
			await db
				.update(schema.variant)
				.set({
					price,
					sku,
					updatedAt: new Date().toISOString()
				})
				.where(eq(schema.variant.id, variantId));

			// Update metafields
			const metafieldsToUpdate = [
				{ namespace: 'book', key: 'binding', value: binding },
				{ namespace: 'book', key: 'number_of_pages', value: numberOfPages },
				{ namespace: 'book', key: 'age', value: age },
				{ namespace: 'book', key: 'publish_month', value: publishMonth },
				{ namespace: 'book', key: 'reading_level', value: readingLevel },
				{ namespace: 'book', key: 'illustrations_by', value: illustrationsBy },
				{ namespace: 'translated_book', key: 'original_title', value: originalTitle },
				{ namespace: 'translated_book', key: 'translated_by', value: translatedBy }
			];

			for (const mf of metafieldsToUpdate) {
				if (mf.value) {
					// Try to find existing metafield
					const existing = await db
						.select()
						.from(schema.metafield)
						.where(
							sql`${schema.metafield.ownerId} = ${variantId} 
                AND ${schema.metafield.namespace} = ${mf.namespace} 
                AND ${schema.metafield.key} = ${mf.key}`
						)
						.limit(1);

					if (existing.length > 0) {
						// Update existing
						await db
							.update(schema.metafield)
							.set({ value: mf.value, updatedAt: new Date().toISOString() })
							.where(eq(schema.metafield.id, existing[0].id));
					} else {
						// Create new metafield
						const metafieldId = `gid://shopify/Metafield/custom-${Date.now()}-${Math.random()
							.toString(36)
							.substr(2, 9)}`;
						await db.insert(schema.metafield).values({
							id: metafieldId,
							ownerId: variantId,
							ownerType: 'variant',
							namespace: mf.namespace,
							key: mf.key,
							value: mf.value,
							type: 'single_line_text_field'
						});
					}
				}
			}

			// TODO: Sync to Shopify

			return { success: true, variant: variantId };
		} catch (error: any) {
			console.error('Error updating variant:', error);
			return fail(500, { error: error.message });
		}
	},

	update: async ({ request, locals, params }) => {
		const db = locals.db;
		const productId = parseInt(params.id);
		const formData = await request.formData();

		const title = formData.get('title') as string;
		const description = formData.get('description') as string;
		const status = formData.get('status') as 'Draft' | 'Active' | 'Archived';
		const price = formData.get('price') ? parseFloat(formData.get('price') as string) : null;
		const isbn = formData.get('isbn') as string | null;
		const sku = formData.get('sku') as string | null;

		if (!title) {
			return fail(400, { error: 'Title is required' });
		}

		try {
			// Update product
			await db
				.update(schema.product)
				.set({
					title,
					description,
					status,
					price,
					isbn,
					sku,
					updatedAt: new Date().toISOString()
				})
				.where(eq(schema.product.id, productId));

			// Update categories and authors
			const selectedCategories = formData.getAll('categories') as string[];
			const selectedAuthors = formData.getAll('authors') as string[];

			// Delete existing category and author links
			await db
				.delete(schema.productsToMetaobjects)
				.where(eq(schema.productsToMetaobjects.productId, productId));

			// Insert new category links
			const linksToInsert = [];
			if (selectedCategories.length > 0) {
				linksToInsert.push(
					...selectedCategories.map((categoryId) => ({
						productId,
						metaobjectId: parseInt(categoryId),
						relationType: 'category' as const,
						position: 0
					}))
				);
			}

			// Insert new author links
			if (selectedAuthors.length > 0) {
				linksToInsert.push(
					...selectedAuthors.map((authorId) => ({
						productId,
						metaobjectId: parseInt(authorId),
						relationType: 'author' as const,
						position: 0
					}))
				);
			}

			if (linksToInsert.length > 0) {
				await db.insert(schema.productsToMetaobjects).values(linksToInsert);
			}

			// TODO: Sync to Shopify

			return { success: true };
		} catch (error: any) {
			console.error('Error updating product:', error);
			return fail(500, { error: error.message });
		}
	}
};
