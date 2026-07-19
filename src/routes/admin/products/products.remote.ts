import { error, redirect } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-valibot';
import { form, query, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { requireAdmin } from '$lib/server/auth';
import { htmlField } from '$lib/utils/tiptap';
import { slugify } from '$lib/utils/slugify';

/**
 * Title search over metaobjects of a type (case-insensitive for ASCII), capped
 * at 20, so the product page doesn't ship every author/category. Served from
 * /_app/remote, so each self-guards with requireAdmin.
 */
async function searchMetaobjects(type: 'author' | 'page', term: string) {
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
						eq(schema.metaobject.type, type),
						sql`lower(${schema.metaobject.title}) like ${'%' + t + '%'}`
					)
				: eq(schema.metaobject.type, type)
		)
		.orderBy(schema.metaobject.title)
		.limit(20);
}

export const searchAuthors = query(v.optional(v.string(), ''), (term) =>
	searchMetaobjects('author', term)
);

/** Category search for the per-variant category picker (pages metaobjects). */
export const searchCategories = query(v.optional(v.string(), ''), (term) =>
	searchMetaobjects('page', term)
);

const db = () => getRequestEvent().locals.db;

/** Form payloads arrive as strings; ids are transformed to numbers after validation */
const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

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

/** SKU: digits only (or empty). */
const skuField = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => s.trim()),
	v.check((s) => s === '' || /^\d+$/.test(s), 'SKU får bara innehålla siffror')
);

/** ISBN-10/13 (hyphens/spaces allowed) or empty; stored verbatim (in barcode). */
const isbnField = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => s.trim()),
	v.check((s) => {
		if (s === '') return true;
		const d = s.replace(/[-\s]/g, '');
		return /^\d{13}$/.test(d) || /^\d{9}[\dXx]$/.test(d);
	}, 'Ogiltigt ISBN')
);

const productFormSchema = v.pick(
	createUpdateSchema(schema.product, {
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Title is required')),
		description: htmlField,
		seoTitle: seoField,
		seoDescription: seoField
	}),
	['title', 'description', 'status', 'seoTitle', 'seoDescription']
);

const variantFormSchema = v.pick(
	createUpdateSchema(schema.variant, {
		price: requiredNumberField,
		sku: skuField,
		barcode: isbnField
	}),
	['price', 'sku', 'barcode']
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

/**
 * Insert a new product locally (no Shopify id). A default variant is created
 * alongside so the record is immediately editable on the existing product edit
 * page (which assumes at least one variant). Handle is derived from the title
 * if the admin didn't provide one; both must remain unique.
 */
export const createProduct = form(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Title is required')),
		handle: v.pipe(
			v.optional(v.string(), ''),
			v.transform((s) => s.trim())
		),
		status: v.picklist(['Draft', 'Active', 'Archived'], 'Invalid status')
	}),
	async ({ title, handle, status }) => {
		const desiredHandle = handle || slugify(title);
		// Guard against collision with an existing product's handle.
		const existing = await db().query.product.findFirst({
			where: eq(schema.product.handle, desiredHandle),
			columns: { id: true }
		});
		if (existing) error(409, `A product with the handle "${desiredHandle}" already exists`);

		const now = new Date().toISOString();
		const [created] = await db()
			.insert(schema.product)
			.values({ title, handle: desiredHandle, status, updatedAt: now })
			.returning({ id: schema.product.id });

		// Local variant id — the edit page expects at least one variant. Real
		// Shopify variants have gid://…/ProductVariant/<n>, so use a distinct
		// `local:` prefix so we never collide with imported ones.
		await db()
			.insert(schema.variant)
			.values({
				id: `local:variant/${created.id}/1`,
				productId: created.id,
				title: 'Default Title',
				price: 0,
				updatedAt: now
			});

		redirect(303, `/admin/products/${created.id}`);
	}
);

export const updateProduct = form(
	v.object({
		id: idField,
		...productFormSchema.entries,
		authors: v.optional(v.array(idField), [])
	}),
	async ({ id, authors, ...productData }) => {
		const existing = await db().query.product.findFirst({
			where: eq(schema.product.id, id),
			columns: { id: true }
		});
		if (!existing) error(404, 'Product not found');

		await db()
			.update(schema.product)
			.set({ ...productData, updatedAt: new Date().toISOString() })
			.where(eq(schema.product.id, id));

		// Replace author links only. Category links are derived per-variant (from
		// each variant's book.category) and rebuilt on variant save — leave them.
		await db()
			.delete(schema.productsToMetaobjects)
			.where(
				and(
					eq(schema.productsToMetaobjects.productId, id),
					eq(schema.productsToMetaobjects.relationType, 'author')
				)
			);

		if (authors.length > 0) {
			await db()
				.insert(schema.productsToMetaobjects)
				.values(
					authors.map((metaobjectId, position) => ({
						productId: id,
						metaobjectId,
						relationType: 'author' as const,
						position
					}))
				);
		}

		return { success: true };
	}
);

export const updateVariant = form(
	v.object({
		variantId: v.pipe(v.string(), v.minLength(1, 'Invalid variant')),
		...variantFormSchema.entries,
		...metafieldEntries,
		// Per-variant categories (page metaobjects), stored as the book.category
		// list.metaobject_reference metafield; product links are derived from these.
		categories: v.optional(v.array(idField), []),
		// Checkbox: present ('true'/'on') when checked, absent when not.
		discontinued: v.optional(v.string())
	}),
	async ({ variantId, price, sku, barcode, categories, discontinued, ...metafieldValues }) => {
		const existing = await db().query.variant.findFirst({
			where: eq(schema.variant.id, variantId),
			columns: { id: true, productId: true }
		});
		if (!existing) error(404, 'Variant not found');

		await db()
			.update(schema.variant)
			.set({
				price,
				sku: sku || null,
				barcode: barcode || null,
				updatedAt: new Date().toISOString()
			})
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

		// book.category is a list.metaobject_reference: store the selected page
		// metaobjects' gids as a JSON array (empty selection clears the metafield).
		{
			const gids =
				categories.length > 0
					? (
							await db()
								.select({ shopifyId: schema.metaobject.shopifyId })
								.from(schema.metaobject)
								.where(inArray(schema.metaobject.id, categories))
						)
							.map((r) => r.shopifyId)
							.filter((g): g is string => !!g)
					: [];
			const value = gids.length ? JSON.stringify(gids) : '';
			const where = and(
				eq(schema.metafield.ownerId, variantId),
				eq(schema.metafield.namespace, 'book'),
				eq(schema.metafield.key, 'category')
			);
			const [current] = await db().select().from(schema.metafield).where(where).limit(1);
			if (!value) {
				if (current) await db().delete(schema.metafield).where(eq(schema.metafield.id, current.id));
			} else if (current) {
				if (current.value !== value || current.type !== 'list.metaobject_reference') {
					await db()
						.update(schema.metafield)
						.set({
							value,
							type: 'list.metaobject_reference',
							updatedAt: new Date().toISOString()
						})
						.where(eq(schema.metafield.id, current.id));
				}
			} else {
				await db().insert(schema.metafield).values({
					id: `local:metafield/${variantId}/book.category`,
					ownerId: variantId,
					ownerType: 'variant',
					namespace: 'book',
					key: 'category',
					value,
					type: 'list.metaobject_reference'
				});
			}
		}

		// Keep the product's derived 'category' links in sync with its variants.
		await rebuildProductCategoryLinks(existing.productId);

		return { success: true };
	}
);

/**
 * Rebuild a product's `productsToMetaobjects` category links from the union of
 * its variants' book.category metafields (each a list.metaobject_reference of
 * metaobject gids). These rows are a derived aggregate the storefront category
 * pages read; categories themselves are edited per variant.
 */
async function rebuildProductCategoryLinks(productId: number) {
	const variants = await db()
		.select({ id: schema.variant.id })
		.from(schema.variant)
		.where(eq(schema.variant.productId, productId));
	const variantIds = variants.map((vrow) => vrow.id);

	const gidSet = new Set<string>();
	if (variantIds.length > 0) {
		const rows = await db()
			.select({ value: schema.metafield.value })
			.from(schema.metafield)
			.where(
				and(
					eq(schema.metafield.namespace, 'book'),
					eq(schema.metafield.key, 'category'),
					inArray(schema.metafield.ownerId, variantIds)
				)
			);
		for (const r of rows) {
			if (!r.value) continue;
			try {
				const arr = JSON.parse(r.value);
				if (Array.isArray(arr)) for (const g of arr) if (typeof g === 'string') gidSet.add(g);
			} catch {
				/* not JSON */
			}
		}
	}

	let metaobjectIds: number[] = [];
	if (gidSet.size > 0) {
		const found = await db()
			.select({ id: schema.metaobject.id })
			.from(schema.metaobject)
			.where(inArray(schema.metaobject.shopifyId, [...gidSet]));
		metaobjectIds = found.map((m) => m.id);
	}

	await db()
		.delete(schema.productsToMetaobjects)
		.where(
			and(
				eq(schema.productsToMetaobjects.productId, productId),
				eq(schema.productsToMetaobjects.relationType, 'category')
			)
		);
	if (metaobjectIds.length > 0) {
		await db()
			.insert(schema.productsToMetaobjects)
			.values(
				metaobjectIds.map((metaobjectId, position) => ({
					productId,
					metaobjectId,
					relationType: 'category' as const,
					position
				}))
			);
	}
}
