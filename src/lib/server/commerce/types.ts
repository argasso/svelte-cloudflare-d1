/**
 * Commerce integration seam. The app depends on these capability interfaces, not
 * on Shopify directly, so the backing provider can be swapped (or turned off)
 * from settings. Today there's one capability — CatalogSync (pull/push/webhook
 * to keep D1 in step with an external catalog) — with `shopify` and `none`
 * providers. Payments/checkout will be a second capability on the same seam.
 */
import type { DbClient } from '$lib/server/db';
import type { SyncFilter } from '$lib/server/sync';

export type ImportStep = 'authors' | 'pages' | 'products' | 'links';

export interface ImportStepResult {
	step: ImportStep;
	imported: number;
	skipped: number;
	/** Next step to run, or null when the import is complete. */
	next: ImportStep | null;
	/** Opaque cursor for the next call of the same step (products/links). */
	cursor: string | null;
}

export interface PushSummary {
	pushed: number;
	conflict: number;
	failed: number;
	skipped: number;
}

export interface PushEntry {
	type: string;
	title: string | null;
	action: string;
	error: string | null;
}

export interface PushResult {
	summary: PushSummary;
	entries: PushEntry[];
}

export interface CatalogSync {
	/** Provider id (e.g. 'shopify' | 'none'). */
	readonly id: string;
	/** Whether the provider can actually run (configured + enabled). */
	readonly enabled: boolean;
	/** Pull one bounded step of an import (caller loops until `next` is null). */
	importStep(db: DbClient, step: ImportStep, cursor: string | null): Promise<ImportStepResult>;
	/**
	 * Create a new product on the provider (so local records can be linked to
	 * it). Returns provider ids for the product + its default variant. Returns
	 * null when the integration is off; the caller then creates a local-only
	 * record with a synthesized id.
	 */
	createProduct(
		input: { title: string; status: 'Draft' | 'Active' | 'Archived' }
	): Promise<{ productShopifyId: string; variantShopifyId: string; updatedAt: string } | null>;
	/** Push local changes to the provider. */
	push(db: DbClient, opts: { filter?: SyncFilter; baseUrl?: string }): Promise<PushResult>;
	/** Discard a record's local edits by pulling the provider's current version. */
	revert(db: DbClient, target: { type: 'product' | 'metaobject'; id: number }): Promise<void>;
	/** Handle an inbound webhook (verify + dispatch); returns the HTTP response. */
	receiveWebhook(db: DbClient, request: Request): Promise<Response>;
}
