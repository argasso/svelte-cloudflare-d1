import { error, redirect } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-valibot';
import { command, form, query, getRequestEvent } from '$app/server';
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

type Db = ReturnType<typeof db>;

/**
 * Insert / update / delete a single variant metafield row so its stored value
 * (and Shopify type) match what the form submitted. Empty `value` removes the
 * row. Centralises the read-then-write dance every managed metafield used to
 * repeat inline. Returns whether it actually changed anything, so the caller can
 * decide whether to bump the owning variant's `updatedAt`.
 */
async function upsertMetafield(
	database: Db,
	variantId: string,
	ns: string,
	key: string,
	value: string,
	type: string
): Promise<boolean> {
	const where = and(
		eq(schema.metafield.ownerId, variantId),
		eq(schema.metafield.namespace, ns),
		eq(schema.metafield.key, key)
	);
	const [current] = await database.select().from(schema.metafield).where(where).limit(1);
	if (!value) {
		if (current) {
			await database.delete(schema.metafield).where(eq(schema.metafield.id, current.id));
			return true;
		}
		return false;
	}
	if (current) {
		const valueChanged = current.value !== value;
		if (valueChanged) {
			await database
				.update(schema.metafield)
				.set({ value, type, updatedAt: new Date().toISOString() })
				.where(eq(schema.metafield.id, current.id));
		} else if (current.type !== type) {
			// Correct a drifted type (e.g. `discontinued` stored as text before it
			// was a boolean) WITHOUT bumping the watermark: the stored value — and
			// thus what Shopify already has — is unchanged, so this is a local
			// normalization, not an edit. Returning false keeps the variant off the
			// pending-sync list when a save only had to fix legacy types.
			await database
				.update(schema.metafield)
				.set({ type })
				.where(eq(schema.metafield.id, current.id));
		}
		return valueChanged;
	}
	await database.insert(schema.metafield).values({
		id: `local:metafield/${variantId}/${ns}.${key}`,
		ownerId: variantId,
		ownerType: 'variant',
		namespace: ns,
		key,
		value,
		type
	});
	return true;
}

/** Comma-separated text → JSON array string (empty when nothing remains). */
function toJsonList(raw: string): string {
	const arr = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return arr.length ? JSON.stringify(arr) : '';
}

/** One variant's slice of the unified product schema. */
const variantInputSchema = v.object({
	variantId: v.pipe(v.string(), v.minLength(1, 'Invalid variant')),
	...variantFormSchema.entries,
	...metafieldEntries,
	// Per-variant categories (page metaobjects), stored as the book.category
	// list.metaobject_reference metafield; product links are derived from these.
	categories: v.optional(v.array(idField), []),
	// Checkbox: present ('true'/'on') when checked, absent when not.
	discontinued: v.optional(v.string()),
	// Selected variant image: '' = product default (null), digit string = media.id.
	imageId: v.optional(v.string())
});
type VariantInput = v.InferOutput<typeof variantInputSchema>;

/** The current variant-row columns needed to detect a real change on save. */
type VariantRow = Pick<
	typeof schema.variant.$inferSelect,
	'title' | 'sku' | 'barcode' | 'imageId' | 'price' | 'option1'
>;

/**
 * Persist a single variant (row + all its metafields) from a validated slice of
 * the unified save. Format (book.binding) drives variant.title + option1. The
 * variant's `updatedAt` — the sync watermark — is only bumped when the row or one
 * of its metafields actually changed, so an untouched variant in a whole-product
 * save doesn't look dirty to `/admin/sync`. Does NOT rebuild the product's derived
 * category links — the caller does that once after all variants are written.
 */
async function applyVariantUpdate(
	database: Db,
	vin: VariantInput,
	current: VariantRow,
	now: string
) {
	const format = (vin.binding ?? '').trim();
	const desired = {
		price: vin.price,
		sku: vin.sku || null,
		barcode: vin.barcode || null,
		title: format || current.title,
		option1: format || current.option1,
		imageId:
			vin.imageId === undefined || vin.imageId === '' ? null : parseInt(vin.imageId, 10)
	};
	let changed =
		desired.price !== current.price ||
		desired.sku !== current.sku ||
		desired.barcode !== current.barcode ||
		desired.title !== current.title ||
		desired.option1 !== current.option1 ||
		desired.imageId !== current.imageId;

	for (const [formKey, def] of Object.entries(bookMetafields) as [
		keyof typeof bookMetafields,
		FieldDef
	][]) {
		const raw = (vin[formKey] ?? '').trim();
		const mfChanged = await upsertMetafield(
			database,
			vin.variantId,
			def.ns,
			def.key,
			def.list ? toJsonList(raw) : raw,
			def.type
		);
		if (mfChanged) changed = true;
	}

	// book.discontinued is a boolean metafield; always stored true/false.
	if (
		await upsertMetafield(
			database,
			vin.variantId,
			'book',
			'discontinued',
			vin.discontinued === 'true' || vin.discontinued === 'on' ? 'true' : 'false',
			'boolean'
		)
	)
		changed = true;

	// book.category is a list.metaobject_reference of the selected pages' gids.
	// Preserve the submitted selection order — `inArray` returns rows in the DB's
	// own order, so map each id through a lookup instead, otherwise an unchanged
	// multi-category variant reorders on every save and looks perpetually dirty.
	let gids: string[] = [];
	if (vin.categories.length > 0) {
		const byId = new Map(
			(
				await database
					.select({ id: schema.metaobject.id, shopifyId: schema.metaobject.shopifyId })
					.from(schema.metaobject)
					.where(inArray(schema.metaobject.id, vin.categories))
			).map((r) => [r.id, r.shopifyId])
		);
		gids = vin.categories
			.map((id) => byId.get(id))
			.filter((g): g is string => !!g);
	}
	if (
		await upsertMetafield(
			database,
			vin.variantId,
			'book',
			'category',
			gids.length ? JSON.stringify(gids) : '',
			'list.metaobject_reference'
		)
	)
		changed = true;

	// Only touch the row (and its updatedAt watermark) when something differs.
	if (changed) {
		await database
			.update(schema.variant)
			.set({ ...desired, updatedAt: now })
			.where(eq(schema.variant.id, vin.variantId));
	}
}

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

/**
 * Save the whole product in one submission: product-level fields, author links,
 * and every variant (row + metafields). The admin page's single Save button
 * posts this one form, so product and variants are treated as one unit here too
 * — one validated payload, one write pass, one derived-category rebuild.
 */
export const saveProduct = form(
	v.object({
		id: idField,
		...productFormSchema.entries,
		authors: v.optional(v.array(idField), []),
		variants: v.optional(v.array(variantInputSchema), [])
	}),
	async ({ id, authors, variants, ...productData }) => {
		const database = db();
		const current = await database.query.product.findFirst({
			where: eq(schema.product.id, id),
			columns: {
				id: true,
				title: true,
				description: true,
				status: true,
				seoTitle: true,
				seoDescription: true
			}
		});
		if (!current) error(404, 'Product not found');

		const now = new Date().toISOString();

		// Only touch the product row (and its updatedAt watermark) when an editable
		// field actually differs — a save that changed only a variant shouldn't
		// mark the product itself dirty on /admin/sync. Nullable text is compared
		// through `?? ''` so null vs '' isn't a false diff.
		const rowChanged =
			current.title !== productData.title ||
			(current.description ?? '') !== (productData.description ?? '') ||
			current.status !== productData.status ||
			(current.seoTitle ?? '') !== (productData.seoTitle ?? '') ||
			(current.seoDescription ?? '') !== (productData.seoDescription ?? '');

		// Author links are a managed product field too, so a change to them bumps
		// updatedAt. Compare the ordered id lists before rewriting. Category links
		// are derived per-variant (rebuilt after the variants below), not here.
		const currentAuthors = (
			await database
				.select({ metaobjectId: schema.productsToMetaobjects.metaobjectId })
				.from(schema.productsToMetaobjects)
				.where(
					and(
						eq(schema.productsToMetaobjects.productId, id),
						eq(schema.productsToMetaobjects.relationType, 'author')
					)
				)
				.orderBy(schema.productsToMetaobjects.position)
		).map((r) => r.metaobjectId);
		const authorsChanged =
			currentAuthors.length !== authors.length ||
			currentAuthors.some((a, i) => a !== authors[i]);

		if (authorsChanged) {
			await database
				.delete(schema.productsToMetaobjects)
				.where(
					and(
						eq(schema.productsToMetaobjects.productId, id),
						eq(schema.productsToMetaobjects.relationType, 'author')
					)
				);
			if (authors.length > 0) {
				await database.insert(schema.productsToMetaobjects).values(
					authors.map((metaobjectId, position) => ({
						productId: id,
						metaobjectId,
						relationType: 'author' as const,
						position
					}))
				);
			}
		}

		if (rowChanged || authorsChanged) {
			await database
				.update(schema.product)
				.set({ ...productData, updatedAt: now })
				.where(eq(schema.product.id, id));
		}

		if (variants.length > 0) {
			// The submission carries the product's whole variant set, so duplicate
			// formats can be caught in-memory (Shopify requires distinct option
			// values). Each variant's intended title is its new format, or its
			// current title when the format is left blank (Default Title case).
			const existingVariants = await database.query.variant.findMany({
				where: eq(schema.variant.productId, id),
				columns: {
					id: true,
					title: true,
					sku: true,
					barcode: true,
					imageId: true,
					price: true,
					option1: true
				}
			});
			const rowById = new Map(existingVariants.map((row) => [row.id, row]));

			const seen = new Set<string>();
			for (const vin of variants) {
				const row = rowById.get(vin.variantId);
				if (!row) {
					error(400, 'Variant does not belong to this product');
				}
				const intended = (vin.binding ?? '').trim() || row.title || '';
				if (intended) {
					if (seen.has(intended)) {
						error(409, `Two variants can't share the format "${intended}"`);
					}
					seen.add(intended);
				}
			}

			for (const vin of variants) {
				await applyVariantUpdate(database, vin, rowById.get(vin.variantId)!, now);
			}
			// Keep the product's derived category links in sync with its variants.
			await rebuildProductCategoryLinks(id);
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
export const createVariant = command(
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
export const deleteVariant = command(
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

/**
 * Copy metafield values from one variant to another on the same product. Skips
 * the truly variant-specific fields (binding = format identity, category = per-
 * variant links, discontinued = per-variant status); everything else in the
 * book / translated_book / audio_book namespaces gets replicated so the target
 * variant inherits book details (pages, age, publish_month, authors, etc.) in
 * one click instead of retyping. Bumps updated_at so the next sync push
 * propagates the copied values.
 */
const VARIANT_SPECIFIC_KEYS = new Set(['binding', 'category', 'discontinued']);
export const copyVariantMetafields = command(
	v.object({
		sourceVariantId: v.pipe(v.string(), v.minLength(1)),
		targetVariantId: v.pipe(v.string(), v.minLength(1))
	}),
	async ({ sourceVariantId, targetVariantId }) => {
		if (sourceVariantId === targetVariantId) error(400, 'Cannot copy from a variant to itself');
		const database = db();
		const [source, target] = await Promise.all([
			database.query.variant.findFirst({
				where: eq(schema.variant.id, sourceVariantId),
				columns: { id: true, productId: true },
				with: { metafields: true }
			}),
			database.query.variant.findFirst({
				where: eq(schema.variant.id, targetVariantId),
				columns: { id: true, productId: true },
				with: { metafields: true }
			})
		]);
		if (!source || !target) error(404, 'Variant not found');
		if (source.productId !== target.productId)
			error(400, 'Both variants must belong to the same product');

		const copyable = source.metafields.filter(
			(m) =>
				(m.namespace === 'book' ||
					m.namespace === 'translated_book' ||
					m.namespace === 'audio_book') &&
				!VARIANT_SPECIFIC_KEYS.has(m.key) &&
				m.value != null &&
				m.type != null
		);
		const targetByKey = new Map(target.metafields.map((m) => [`${m.namespace}.${m.key}`, m]));
		const now = new Date().toISOString();

		for (const src of copyable) {
			const composite = `${src.namespace}.${src.key}`;
			const existing = targetByKey.get(composite);
			if (existing) {
				if (existing.value !== src.value || existing.type !== src.type) {
					await database
						.update(schema.metafield)
						.set({ value: src.value!, type: src.type!, updatedAt: now })
						.where(eq(schema.metafield.id, existing.id));
				}
			} else {
				await database.insert(schema.metafield).values({
					id: `local:metafield/${target.id}/${src.namespace}.${src.key}`,
					ownerId: target.id,
					ownerType: 'variant',
					namespace: src.namespace,
					key: src.key,
					value: src.value!,
					type: src.type!
				});
			}
		}

		await database
			.update(schema.variant)
			.set({ updatedAt: now })
			.where(eq(schema.variant.id, targetVariantId));

		return { success: true, copied: copyable.length };
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
