/**
 * Managed-field snapshots for field-level conflict detection.
 *
 * For each syncable type we define the set of fields the admin manages and a
 * canonical normalization, so a local row and a Shopify response hash to the
 * same value iff they represent the same managed content. The hash is stored
 * per row (shopify_field_hash) as the base; on a timestamp conflict we compare
 * Shopify's current fields against it.
 *
 * Normalization is best-effort: any mismatch produces a *different* hash, which
 * the orchestrator treats as a (safe) conflict — never a silent overwrite.
 */
import type { metaobject } from '$lib/db/schema';

export type ManagedFields = Record<string, string>;

/** Stable, order-independent string of a field map */
function canonical(fields: ManagedFields): string {
	return JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
}

/** Small deterministic hash (FNV-1a, hex). Not cryptographic — change detection only. */
export function hashFields(fields: ManagedFields): string {
	const str = canonical(fields);
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

// --- product ---

export function productStatusToShopify(status: string): string {
	if (status === 'Active') return 'ACTIVE';
	if (status === 'Archived') return 'ARCHIVED';
	return 'DRAFT';
}

/** Canonical (sorted) JSON of a metaobject-reference gid list */
export function gidList(gids: string[]): string {
	return JSON.stringify([...gids].sort());
}

export function productManagedFields(
	row: { title: string; description: string | null; status: string },
	authorGids: string[] = []
): ManagedFields {
	return {
		title: row.title,
		descriptionHtml: row.description ?? '',
		status: productStatusToShopify(row.status),
		// custom.authors link — categories live on variants and aren't hashed here
		authors: gidList(authorGids)
	};
}

// --- variant (price/sku; metafield-level is out of scope, see index.ts) ---

/**
 * Canonical price string. A local JS number (149) and Shopify's formatted
 * string ("149.00") must hash equal, so route both through Number first —
 * otherwise the field-hash refinement reports false conflicts on every variant.
 */
export function normalizePrice(price: number | string | null | undefined): string {
	const n = Number(price ?? 0);
	return Number.isFinite(n) ? String(n) : '';
}

export function variantManagedFields(row: { price: number; sku: string | null }): ManagedFields {
	return { price: normalizePrice(row.price), sku: row.sku ?? '' };
}

// --- metaobject (the substantive `fields` content) ---

/** Normalize one metaobject field value the way Shopify stores/returns it */
function metaobjectValue(raw: unknown): string {
	if (raw === null || raw === undefined) return '';
	if (typeof raw === 'string') return raw;
	if (Array.isArray(raw) || typeof raw === 'object') return JSON.stringify(raw);
	return String(raw);
}

export function metaobjectManagedFields(
	fields: (typeof metaobject.$inferSelect)['fields']
): ManagedFields {
	const out: ManagedFields = {};
	for (const [key, raw] of Object.entries(fields ?? {})) {
		const value = metaobjectValue(raw);
		if (value !== '') out[key] = value; // drop empties so omitted == null
	}
	return out;
}

/** Build managed fields from a Shopify metaobject's field list */
export function metaobjectManagedFieldsFromRemote(
	fields: { key: string; value: string | null }[]
): ManagedFields {
	const out: ManagedFields = {};
	for (const f of fields) {
		if (f.value != null && f.value !== '') out[f.key] = f.value;
	}
	return out;
}
