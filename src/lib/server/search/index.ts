/**
 * Full-text search over all storefront content (books, authors, pages), backed
 * by the `search_index` FTS5 virtual table (migration 0015). The table isn't
 * modeled by Drizzle (it's a virtual table), so it's read/written with raw SQL.
 *
 * The index is app-maintained: `rebuildSearchIndex` repopulates it from scratch
 * (run after an import and from the admin "Rebuild search index" button) and the
 * `reindex*` helpers keep single rows fresh on admin edits. The searchable text
 * spans joins (author names, variant SKUs, rich-text bodies) which is why a pure
 * trigger-kept external-content table wouldn't work.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { convertSchemaToHtml } from '$lib/utils/richtext';

// The FTS5 table is virtual; Drizzle's typed query builder can't target it.
type AnyDb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SearchKind = 'book' | 'author' | 'page';

type IndexRow = {
	kind: SearchKind;
	refId: number;
	handle: string;
	title: string;
	body: string;
};

export type SearchHit = { id: number; handle: string; title: string };
export type SearchResults = {
	books: SearchHit[];
	authors: SearchHit[];
	pages: SearchHit[];
	/** The FTS5 MATCH expression used, or null when the query was empty. */
	match: string | null;
};

// --- text extraction -------------------------------------------------------

function htmlToText(html?: string | null): string {
	if (!html) return '';
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Shopify rich-text JSON → plain text (for author bios + page content). */
function richJsonToText(raw: unknown): string {
	if (!raw) return '';
	try {
		const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return htmlToText(convertSchemaToHtml(json));
	} catch {
		return '';
	}
}

// --- row builders ----------------------------------------------------------

/** Build the book index rows for a set of products (joins authors + SKUs). */
async function buildBookRows(db: DbClient, productIds?: number[]): Promise<IndexRow[]> {
	// Only Active, handled products are searchable (the book page needs a handle).
	const conditions = [eq(schema.product.status, 'Active'), isNotNull(schema.product.handle)];
	if (productIds) conditions.push(inArray(schema.product.id, productIds));
	const products = await db
		.select({
			id: schema.product.id,
			handle: schema.product.handle,
			title: schema.product.title,
			description: schema.product.description
		})
		.from(schema.product)
		.where(and(...conditions));
	if (products.length === 0) return [];
	const ids = new Set(products.map((p) => p.id));

	// Author names per product (relationType='author').
	const authorRows = await db
		.select({
			productId: schema.productsToMetaobjects.productId,
			name: schema.metaobject.title
		})
		.from(schema.productsToMetaobjects)
		.innerJoin(
			schema.metaobject,
			eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId)
		)
		.where(eq(schema.productsToMetaobjects.relationType, 'author'));
	const authorsByProduct = new Map<number, string[]>();
	for (const r of authorRows) {
		if (!ids.has(r.productId) || !r.name) continue;
		const list = authorsByProduct.get(r.productId) ?? [];
		list.push(r.name);
		authorsByProduct.set(r.productId, list);
	}

	// SKU + barcode (ISBN) per product, from its variants.
	const variantRows = await db
		.select({
			productId: schema.variant.productId,
			sku: schema.variant.sku,
			barcode: schema.variant.barcode
		})
		.from(schema.variant);
	const codesByProduct = new Map<number, string[]>();
	for (const r of variantRows) {
		if (r.productId == null || !ids.has(r.productId)) continue;
		const list = codesByProduct.get(r.productId) ?? [];
		if (r.sku) list.push(r.sku);
		if (r.barcode) list.push(r.barcode);
		codesByProduct.set(r.productId, list);
	}

	return products.map((p) => ({
		kind: 'book' as const,
		refId: p.id,
		handle: p.handle as string,
		title: p.title,
		body: [
			...(authorsByProduct.get(p.id) ?? []),
			...(codesByProduct.get(p.id) ?? []),
			htmlToText(p.description)
		]
			.filter(Boolean)
			.join(' ')
	}));
}

function metaobjectRow(m: schema.Metaobject): IndexRow | null {
	if (!m.handle || m.status !== 'Active') return null;
	if (schema.isAuthor(m)) {
		return {
			kind: 'author',
			refId: m.id,
			handle: m.handle,
			title: m.title ?? m.handle,
			body: richJsonToText(m.fields?.description)
		};
	}
	if (schema.isPage(m)) {
		const f = m.fields;
		return {
			kind: 'page',
			refId: m.id,
			handle: m.handle,
			title: m.title ?? f?.title ?? m.handle,
			body: [richJsonToText(f?.content), f?.meta_title_seo, f?.meta_description_seo]
				.filter(Boolean)
				.join(' ')
		};
	}
	return null;
}

// --- writes ----------------------------------------------------------------

/** Multi-row INSERT in chunks that stay under D1's ~100 bound-param cap. */
async function insertRows(db: DbClient, rows: IndexRow[]): Promise<void> {
	const CHUNK = 18; // 5 columns × 18 = 90 params
	for (let i = 0; i < rows.length; i += CHUNK) {
		const tuples = rows
			.slice(i, i + CHUNK)
			.map((r) => sql`(${r.kind}, ${r.refId}, ${r.handle}, ${r.title}, ${r.body})`);
		await (db as AnyDb).run(
			sql`INSERT INTO search_index (kind, ref_id, handle, title, body) VALUES ${sql.join(tuples, sql`, `)}`
		);
	}
}

async function deleteKind(db: DbClient, kind: SearchKind, refId: number): Promise<void> {
	await (db as AnyDb).run(
		sql`DELETE FROM search_index WHERE kind = ${kind} AND ref_id = ${refId}`
	);
}

/** Rebuild the whole index from scratch. Cheap at this catalogue's scale. */
export async function rebuildSearchIndex(
	db: DbClient
): Promise<{ books: number; authors: number; pages: number }> {
	const books = await buildBookRows(db);
	const metaobjects = await db.select().from(schema.metaobject);
	const metaRows = metaobjects.map(metaobjectRow).filter((r): r is IndexRow => r !== null);

	await (db as AnyDb).run(sql`DELETE FROM search_index`);
	await insertRows(db, [...books, ...metaRows]);

	return {
		books: books.length,
		authors: metaRows.filter((r) => r.kind === 'author').length,
		pages: metaRows.filter((r) => r.kind === 'page').length
	};
}

/** Re-index a single product (book). Removes it when no longer Active/handled. */
export async function reindexProduct(db: DbClient, productId: number): Promise<void> {
	await deleteKind(db, 'book', productId);
	const rows = await buildBookRows(db, [productId]);
	if (rows.length) await insertRows(db, rows);
}

/** Re-index one metaobject (author or page) by its id. */
export async function reindexMetaobject(db: DbClient, id: number): Promise<void> {
	const m = await db.query.metaobject.findFirst({ where: eq(schema.metaobject.id, id) });
	await deleteKind(db, 'author', id);
	await deleteKind(db, 'page', id);
	if (!m) return;
	const row = metaobjectRow(m);
	if (row) await insertRows(db, [row]);
	// An author's name is part of every linked book's body — refresh those too.
	if (m.type === 'author') {
		const links = await db
			.select({ productId: schema.productsToMetaobjects.productId })
			.from(schema.productsToMetaobjects)
			.where(
				and(
					eq(schema.productsToMetaobjects.metaobjectId, id),
					eq(schema.productsToMetaobjects.relationType, 'author')
				)
			);
		for (const l of links) await reindexProduct(db, l.productId);
	}
}

/** Remove a row from the index (e.g. on delete). */
export async function removeFromIndex(
	db: DbClient,
	kind: SearchKind,
	refId: number
): Promise<void> {
	await deleteKind(db, kind, refId);
}

// --- query -----------------------------------------------------------------

/**
 * Turn raw user input into a safe FTS5 MATCH expression: each word becomes a
 * quoted term (implicit AND between them) and the last term gets a `*` prefix so
 * typing feels like autocomplete. Returns null when there's nothing to match.
 */
export function buildMatch(raw: string): string | null {
	const terms = (raw ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu);
	if (!terms || terms.length === 0) return null;
	return terms.map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`)).join(' ');
}

/** Search all content, grouped by kind and ranked by relevance (bm25). */
export async function searchAll(
	db: DbClient,
	raw: string,
	limits: { book?: number; author?: number; page?: number } = {}
): Promise<SearchResults> {
	const match = buildMatch(raw);
	if (!match) return { books: [], authors: [], pages: [], match: null };

	const byKind = async (kind: SearchKind, limit: number): Promise<SearchHit[]> => {
		// bm25 weights per declared column (kind/ref_id/handle are UNINDEXED and
		// ignored); title weighted above body. Lower bm25 = better → ORDER BY ASC.
		const rows = (await (db as AnyDb).all(sql`
			SELECT ref_id AS id, handle, title, bm25(search_index, 1.0, 1.0, 1.0, 10.0, 1.0) AS rank
			FROM search_index
			WHERE search_index MATCH ${match} AND kind = ${kind}
			ORDER BY rank
			LIMIT ${limit}
		`)) as Array<{ id: number | string; handle: string; title: string }>;
		return rows.map((r) => ({ id: Number(r.id), handle: r.handle, title: r.title }));
	};

	const [books, authors, pages] = await Promise.all([
		byKind('book', limits.book ?? 50),
		byKind('author', limits.author ?? 20),
		byKind('page', limits.page ?? 20)
	]);
	return { books, authors, pages, match };
}
