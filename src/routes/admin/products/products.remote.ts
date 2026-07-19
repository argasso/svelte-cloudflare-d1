import { error, redirect } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-valibot';
import { form, query, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { requireAdmin } from '$lib/server/auth';
import { htmlField } from '$lib/utils/tiptap';
import { slugify } from '$lib/utils/slugify';
import { getCatalogSync } from '$lib/server/commerce';
import { getSettings } from '$lib/server/settings';
import { hashFields, productManagedFields, variantManagedFields } from '$lib/server/sync/fields';

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
 * Insert a new product. When Shopify sync is enabled the record is provisioned
 * on Shopify first (productCreate returns the product + its auto-generated
 * default variant) so both records land locally with real gids and a clean sync
 * watermark. When sync is off the catalog seam returns null and we fall back to
 * a synthetic `local:variant/…` id — the record can be pushed later if the
 * integration is turned back on. Handle is derived from the title if omitted;
 * both must remain unique.
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
		const database = db();
		const desiredHandle = handle || slugify(title);
		// Guard against collision with an existing product's handle.
		const existing = await database.query.product.findFirst({
			where: eq(schema.product.handle, desiredHandle),
			columns: { id: true }
		});
		if (existing) error(409, `A product with the handle "${desiredHandle}" already exists`);

		// Ask the catalog provider to provision remotely; returns null when the
		// Shopify integration is off (kill switch honoured transparently).
		const settings = await getSettings(database);
		let provisioned: Awaited<ReturnType<ReturnType<typeof getCatalogSync>['createProduct']>>;
		try {
			provisioned = await getCatalogSync(settings).createProduct({ title, status });
		} catch (e) {
			error(502, `Could not create the product on Shopify: ${e instanceof Error ? e.message : e}`);
		}

		const now = new Date().toISOString();
		// Shopify products store shopify_id as a bare numeric (see productGid in
		// sync/index.ts). Variants store the full gid as their primary key.
		const productShopifyNumericId = provisioned
			? provisioned.productShopifyId.split('/').pop() ?? null
			: null;

		const [created] = await database
			.insert(schema.product)
			.values({
				title,
				handle: desiredHandle,
				status,
				updatedAt: now,
				shopifyId: productShopifyNumericId,
				shopifyUpdatedAt: provisioned?.updatedAt ?? null,
				lastSyncedAt: provisioned ? now : null,
				shopifyFieldHash: provisioned
					? hashFields(productManagedFields({ title, description: null, status }, []))
					: null
			})
			.returning({ id: schema.product.id });

		const variantId = provisioned
			? provisioned.variantShopifyId
			: `local:variant/${created.id}/1`;

		await database.insert(schema.variant).values({
			id: variantId,
			productId: created.id,
			title: 'Default Title',
			price: 0,
			updatedAt: now,
			shopifyUpdatedAt: provisioned?.updatedAt ?? null,
			lastSyncedAt: provisioned ? now : null,
			shopifyFieldHash: provisioned
				? hashFields(variantManagedFields({ price: 0, sku: null, title: 'Default Title' }))
				: null
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

/**
 * Add a variant to an existing product. When the parent product has a Shopify
 * id AND sync is enabled, the variant is created on Shopify first and the
 * returned gid becomes the local primary key; otherwise a local:variant/…
 * synthetic id is used. Kept minimal — title + price only; the rest is edited
 * on the product page after creation.
 */
export const createVariant = form(
	v.object({
		productId: idField,
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Variant title is required')),
		price: requiredNumberField
	}),
	async ({ productId, title, price }) => {
		const database = db();
		const product = await database.query.product.findFirst({
			where: eq(schema.product.id, productId),
			columns: { id: true, shopifyId: true }
		});
		if (!product) error(404, 'Product not found');

		// Reject duplicates: Shopify won't accept two variants with the same
		// option value, and semantically two "Danskt band" variants of the same
		// book don't make sense. Check both title AND book.binding metafield
		// (the two are supposed to be in sync but historic data may drift).
		const siblings = await database.query.variant.findMany({
			where: eq(schema.variant.productId, productId),
			columns: { id: true, title: true },
			with: { metafields: { columns: { namespace: true, key: true, value: true } } }
		});
		const alreadyUsed = siblings.some((s) => {
			if (s.title === title) return true;
			return s.metafields.some(
				(m) => m.namespace === 'book' && m.key === 'binding' && m.value === title
			);
		});
		if (alreadyUsed) error(409, `A "${title}" variant already exists on this product`);

		const settings = await getSettings(database);
		const canPushToShopify = settings.syncEnabled && !!product.shopifyId;

		let provisioned: { variantShopifyId: string; updatedAt: string } | null = null;
		if (canPushToShopify) {
			const productGid = `gid://shopify/Product/${product.shopifyId}`;
			try {
				provisioned = await getCatalogSync(settings).createVariant(productGid, { title, price });
			} catch (e) {
				error(502, `Could not create the variant on Shopify: ${e instanceof Error ? e.message : e}`);
			}
		}

		const now = new Date().toISOString();
		// New synthetic id derives from an existing variant count so multiple
		// local variants don't collide on the same product.
		const localVariantCount = await database
			.select({ id: schema.variant.id })
			.from(schema.variant)
			.where(eq(schema.variant.productId, productId));
		const variantId =
			provisioned?.variantShopifyId ?? `local:variant/${productId}/${localVariantCount.length + 1}`;

		await database.insert(schema.variant).values({
			id: variantId,
			productId,
			title,
			price,
			option1: title, // mirror Shopify's default: option1 gets the variant title
			updatedAt: now,
			shopifyUpdatedAt: provisioned?.updatedAt ?? null,
			lastSyncedAt: provisioned ? now : null,
			shopifyFieldHash: provisioned
				? hashFields(variantManagedFields({ price, sku: null, title }))
				: null
		});

		// Mirror the format into the book.binding metafield so the new variant is
		// consistent with the "format == title == binding" invariant admins expect.
		await database.insert(schema.metafield).values({
			id: `local:metafield/${variantId}/book.binding`,
			ownerId: variantId,
			ownerType: 'variant',
			namespace: 'book',
			key: 'binding',
			value: title,
			type: 'single_line_text_field'
		});

		return { success: true };
	}
);

/**
 * Remove a variant. Also deletes it on Shopify when the parent product has a
 * shopify_id and sync is enabled. Refuses to delete the last remaining variant
 * (a product must have at least one — Shopify requires it too).
 */
export const deleteVariant = form(
	v.object({
		variantId: v.pipe(v.string(), v.minLength(1, 'Invalid variant'))
	}),
	async ({ variantId }) => {
		const database = db();
		const variant = await database.query.variant.findFirst({
			where: eq(schema.variant.id, variantId),
			columns: { id: true, productId: true }
		});
		if (!variant) error(404, 'Variant not found');

		const siblings = await database
			.select({ id: schema.variant.id })
			.from(schema.variant)
			.where(eq(schema.variant.productId, variant.productId));
		if (siblings.length <= 1) error(409, 'Cannot delete the last variant of a product');

		const product = await database.query.product.findFirst({
			where: eq(schema.product.id, variant.productId),
			columns: { shopifyId: true }
		});

		const settings = await getSettings(database);
		if (settings.syncEnabled && product?.shopifyId && variantId.startsWith('gid://')) {
			const productGid = `gid://shopify/Product/${product.shopifyId}`;
			try {
				await getCatalogSync(settings).deleteVariant(productGid, variantId);
			} catch (e) {
				error(502, `Could not delete the variant on Shopify: ${e instanceof Error ? e.message : e}`);
			}
		}

		// Delete local metafields + the variant. Category links are rebuilt from
		// remaining variants on the next variant save.
		await database.delete(schema.metafield).where(eq(schema.metafield.ownerId, variantId));
		await database.delete(schema.variant).where(eq(schema.variant.id, variantId));

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
			columns: { id: true, productId: true, title: true }
		});
		if (!existing) error(404, 'Variant not found');

		// Format (book.binding) is edited in the same admin control as the variant
		// title now — mirror it into variant.title + option1 so the two stay in
		// step. Empty format leaves the title alone (Default Title case).
		const format = (metafieldValues.binding ?? '').trim();

		// Reject a rename that would collide with another variant on the same
		// product (Shopify would refuse the update anyway; nicer to catch here).
		if (format && format !== existing.title) {
			const conflict = await db().query.variant.findFirst({
				where: and(
					eq(schema.variant.productId, existing.productId),
					eq(schema.variant.title, format)
				),
				columns: { id: true }
			});
			if (conflict && conflict.id !== existing.id) {
				error(409, `A "${format}" variant already exists on this product`);
			}
		}
		await db()
			.update(schema.variant)
			.set({
				price,
				sku: sku || null,
				barcode: barcode || null,
				...(format ? { title: format, option1: format } : {}),
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
