import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-valibot';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { htmlField } from '$lib/utils/tiptap';

const db = () => getRequestEvent().locals.db;

/** Form payloads arrive as strings; ids are transformed to numbers after validation */
const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

/** Numeric column from a text input; empty string means null */
const numberField = v.pipe(
	v.string(),
	v.regex(/^\s*\d*([.,]\d+)?\s*$/, 'Must be a number'),
	v.transform((s) => (s.trim() === '' ? null : Number(s.trim().replace(',', '.'))))
);

const requiredNumberField = v.pipe(
	v.string(),
	v.regex(/^\s*\d+([.,]\d+)?\s*$/, 'Must be a number'),
	v.transform((s) => Number(s.trim().replace(',', '.')))
);

/**
 * Update schemas are derived from the Drizzle tables, so field names and the
 * status enum stay in lockstep with the schema (renaming a column breaks the
 * pick at compile time). Overrides adapt columns to the form wire format:
 * strings everywhere, with coercion for numbers and '' for null.
 */
/** Optional text input → trimmed string or null (empty means "no SEO override") */
const seoField = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => (s.trim() ? s.trim() : null))
);

const productFormSchema = v.pick(
	createUpdateSchema(schema.product, {
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Title is required')),
		description: htmlField,
		price: numberField,
		isbn: v.optional(v.string()),
		sku: v.optional(v.string()),
		seoTitle: seoField,
		seoDescription: seoField
	}),
	['title', 'description', 'status', 'price', 'isbn', 'sku', 'seoTitle', 'seoDescription']
);

const variantFormSchema = v.pick(
	createUpdateSchema(schema.variant, {
		price: requiredNumberField,
		sku: v.optional(v.string())
	}),
	['price', 'sku']
);

/** Variant metafields are EAV rows, not columns — explicit by necessity */
const bookMetafields = {
	binding: ['book', 'binding'],
	numberOfPages: ['book', 'number_of_pages'],
	age: ['book', 'age'],
	publishMonth: ['book', 'publish_month'],
	readingLevel: ['book', 'reading_level'],
	illustrationsBy: ['book', 'illustrations_by'],
	originalTitle: ['translated_book', 'original_title'],
	translatedBy: ['translated_book', 'translated_by'],
	narratedBy: ['audio_book', 'narrated_by'],
	duration: ['audio_book', 'duration']
} as const satisfies Record<string, readonly [string, string]>;

const metafieldField = v.optional(v.string(), '');
const metafieldEntries = {
	binding: metafieldField,
	numberOfPages: metafieldField,
	age: metafieldField,
	publishMonth: metafieldField,
	readingLevel: metafieldField,
	illustrationsBy: metafieldField,
	originalTitle: metafieldField,
	translatedBy: metafieldField,
	narratedBy: metafieldField,
	duration: metafieldField
} satisfies Record<keyof typeof bookMetafields, unknown>;

export const updateProduct = form(
	v.object({
		id: idField,
		...productFormSchema.entries,
		categories: v.optional(v.array(idField), []),
		authors: v.optional(v.array(idField), [])
	}),
	async ({ id, categories, authors, ...productData }) => {
		const existing = await db().query.product.findFirst({
			where: eq(schema.product.id, id),
			columns: { id: true }
		});
		if (!existing) error(404, 'Product not found');

		await db()
			.update(schema.product)
			.set({ ...productData, updatedAt: new Date().toISOString() })
			.where(eq(schema.product.id, id));

		// Replace category/author links (featured_in links are left alone)
		await db()
			.delete(schema.productsToMetaobjects)
			.where(
				and(
					eq(schema.productsToMetaobjects.productId, id),
					inArray(schema.productsToMetaobjects.relationType, ['category', 'author'])
				)
			);

		const links = [
			...categories.map((metaobjectId, position) => ({
				productId: id,
				metaobjectId,
				relationType: 'category' as const,
				position
			})),
			...authors.map((metaobjectId, position) => ({
				productId: id,
				metaobjectId,
				relationType: 'author' as const,
				position
			}))
		];

		if (links.length > 0) {
			await db().insert(schema.productsToMetaobjects).values(links);
		}

		return { success: true };
	}
);

export const updateVariant = form(
	v.object({
		variantId: v.pipe(v.string(), v.minLength(1, 'Invalid variant')),
		...variantFormSchema.entries,
		...metafieldEntries,
		// Checkbox: present ('true'/'on') when checked, absent when not.
		discontinued: v.optional(v.string())
	}),
	async ({ variantId, price, sku, discontinued, ...metafieldValues }) => {
		const existing = await db().query.variant.findFirst({
			where: eq(schema.variant.id, variantId),
			columns: { id: true }
		});
		if (!existing) error(404, 'Variant not found');

		await db()
			.update(schema.variant)
			.set({ price, sku, updatedAt: new Date().toISOString() })
			.where(eq(schema.variant.id, variantId));

		for (const [formKey, [namespace, key]] of Object.entries(bookMetafields)) {
			const value = metafieldValues[formKey as keyof typeof bookMetafields].trim();

			const where = and(
				eq(schema.metafield.ownerId, variantId),
				eq(schema.metafield.namespace, namespace),
				eq(schema.metafield.key, key)
			);
			const [current] = await db().select().from(schema.metafield).where(where).limit(1);

			if (!value) {
				// Cleared in the form: remove the metafield row
				if (current) {
					await db().delete(schema.metafield).where(eq(schema.metafield.id, current.id));
				}
			} else if (current) {
				if (current.value !== value) {
					await db()
						.update(schema.metafield)
						.set({ value, updatedAt: new Date().toISOString() })
						.where(eq(schema.metafield.id, current.id));
				}
			} else {
				const metafieldId = `local:metafield/${variantId}/${namespace}.${key}`;
				await db().insert(schema.metafield).values({
					id: metafieldId,
					ownerId: variantId,
					ownerType: 'variant',
					namespace,
					key,
					value,
					type: 'single_line_text_field'
				});
			}
		}

		// book.discontinued is a boolean metafield (type 'boolean', not text) so it
		// pushes to Shopify with the correct type. Always stored as true/false.
		{
			const value = discontinued === 'true' || discontinued === 'on' ? 'true' : 'false';
			const where = and(
				eq(schema.metafield.ownerId, variantId),
				eq(schema.metafield.namespace, 'book'),
				eq(schema.metafield.key, 'discontinued')
			);
			const [current] = await db().select().from(schema.metafield).where(where).limit(1);
			if (current) {
				if (current.value !== value || current.type !== 'boolean') {
					await db()
						.update(schema.metafield)
						.set({ value, type: 'boolean', updatedAt: new Date().toISOString() })
						.where(eq(schema.metafield.id, current.id));
				}
			} else {
				await db().insert(schema.metafield).values({
					id: `local:metafield/${variantId}/book.discontinued`,
					ownerId: variantId,
					ownerType: 'variant',
					namespace: 'book',
					key: 'discontinued',
					value,
					type: 'boolean'
				});
			}
		}

		return { success: true };
	}
);
