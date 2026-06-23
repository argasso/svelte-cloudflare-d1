import { error } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-valibot';
import { form, query, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { requireAdmin } from '$lib/server/auth';
import { htmlField } from '$lib/utils/tiptap';

/**
 * Author search for the admin author picker — matches title (case-insensitive
 * for ASCII), capped at 20, so the product page doesn't ship every author.
 * Served from /_app/remote, so it self-guards with requireAdmin.
 */
export const searchAuthors = query(v.optional(v.string(), ''), async (term) => {
	const event = getRequestEvent();
	await requireAdmin(event);
	const t = term.trim().toLowerCase();
	return event.locals.db
		.select({
			id: schema.metaobject.id,
			title: schema.metaobject.title,
			handle: schema.metaobject.handle
		})
		.from(schema.metaobject)
		.where(
			t
				? and(
						eq(schema.metaobject.type, 'author'),
						sql`lower(${schema.metaobject.title}) like ${'%' + t + '%'}`
					)
				: eq(schema.metaobject.type, 'author')
		)
		.orderBy(schema.metaobject.title)
		.limit(20);
});

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

/**
 * Variant metafields are EAV rows, not columns — explicit by necessity. Each
 * carries its Shopify metafield type so we store/push the right type (lists are
 * JSON arrays, reading_level is an integer, etc.) rather than text for all.
 */
type FieldDef = { ns: string; key: string; type: string; list?: boolean };
const bookMetafields = {
	binding: { ns: 'book', key: 'binding', type: 'single_line_text_field' },
	numberOfPages: { ns: 'book', key: 'number_of_pages', type: 'single_line_text_field' },
	age: { ns: 'book', key: 'age', type: 'single_line_text_field' },
	publishMonth: { ns: 'book', key: 'publish_month', type: 'date' },
	readingLevel: { ns: 'book', key: 'reading_level', type: 'number_integer' },
	illustrationsBy: { ns: 'book', key: 'illustrations_by', type: 'list.single_line_text_field', list: true },
	editedBy: { ns: 'book', key: 'edited_by', type: 'list.single_line_text_field', list: true },
	originalTitle: { ns: 'translated_book', key: 'original_title', type: 'single_line_text_field' },
	translatedBy: { ns: 'translated_book', key: 'translated_by', type: 'single_line_text_field' },
	narratedBy: { ns: 'audio_book', key: 'narrated_by', type: 'single_line_text_field' },
	duration: { ns: 'audio_book', key: 'duration', type: 'single_line_text_field' }
} as const satisfies Record<string, FieldDef>;

const metafieldField = v.optional(v.string(), '');
const metafieldEntries = Object.fromEntries(
	Object.keys(bookMetafields).map((k) => [k, metafieldField])
) as Record<keyof typeof bookMetafields, typeof metafieldField>;

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

		for (const [formKey, def] of Object.entries(bookMetafields) as [string, FieldDef][]) {
			const raw = (metafieldValues[formKey as keyof typeof bookMetafields] ?? '').trim();
			// List fields are entered comma-separated and stored as a JSON array.
			const value = def.list
				? (() => {
						const arr = raw
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						return arr.length ? JSON.stringify(arr) : '';
					})()
				: raw;

			const where = and(
				eq(schema.metafield.ownerId, variantId),
				eq(schema.metafield.namespace, def.ns),
				eq(schema.metafield.key, def.key)
			);
			const [current] = await db().select().from(schema.metafield).where(where).limit(1);

			if (!value) {
				// Cleared in the form: remove the metafield row
				if (current) {
					await db().delete(schema.metafield).where(eq(schema.metafield.id, current.id));
				}
			} else if (current) {
				// Also correct the stored type (drift from earlier text-only handling).
				if (current.value !== value || current.type !== def.type) {
					await db()
						.update(schema.metafield)
						.set({ value, type: def.type, updatedAt: new Date().toISOString() })
						.where(eq(schema.metafield.id, current.id));
				}
			} else {
				await db().insert(schema.metafield).values({
					id: `local:metafield/${variantId}/${def.ns}.${def.key}`,
					ownerId: variantId,
					ownerType: 'variant',
					namespace: def.ns,
					key: def.key,
					value,
					type: def.type
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
