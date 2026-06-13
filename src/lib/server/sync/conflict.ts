/**
 * Optimistic-concurrency conflict detection for D1 -> Shopify sync.
 *
 * Shopify's Admin API offers no compare-and-swap, so we guard pushes ourselves:
 * before writing, compare Shopify's *current* `updatedAt` against the version we
 * last saw (`shopifyUpdatedAt`, stored per row). They must match — otherwise
 * Shopify changed since our base and a blind push would overwrite newer data.
 *
 * Timestamps are compared as Shopify-issued strings (server-authoritative); we
 * never compare against the local clock. We normalize to epoch millis so format
 * differences (e.g. trailing `Z`, fractional seconds) don't cause false misses.
 */

export type SyncDecision =
	/** Local row matches Shopify (or has no local edits) — nothing to push */
	| { action: 'skip'; reason: 'not-dirty' | 'in-sync' }
	/** Safe to push: Shopify is unchanged since our base version */
	| { action: 'push' }
	/** Shopify moved since our base — pushing would clobber newer data */
	| { action: 'conflict'; base: string | null; remote: string | null }
	/** We have no recorded base version — must pull/import before pushing */
	| { action: 'needs-base' };

export interface SyncState {
	/** Local last-edit time (set by admin edits) */
	updatedAt: string;
	/** When we last successfully synced this row */
	lastSyncedAt: string | null;
	/** Shopify's updatedAt as of our last sync — the base version */
	shopifyUpdatedAt: string | null;
}

/** Parse a timestamp to epoch millis; null/invalid -> null */
export function toEpoch(ts: string | null | undefined): number | null {
	if (!ts) return null;
	// SQLite CURRENT_TIMESTAMP uses "YYYY-MM-DD HH:MM:SS" (UTC, no zone) — treat as UTC
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)
		? ts.replace(' ', 'T') + 'Z'
		: ts;
	const ms = Date.parse(normalized);
	return Number.isNaN(ms) ? null : ms;
}

/** A row has local edits to push when it changed after the last sync */
export function isDirty(state: SyncState): boolean {
	const edited = toEpoch(state.updatedAt);
	const synced = toEpoch(state.lastSyncedAt);
	if (edited === null) return false;
	if (synced === null) return true; // never synced but has a local row
	return edited > synced;
}

/**
 * Decide what to do for one entity, given its local sync state and the current
 * `updatedAt` Shopify reports right now (fetched just before pushing).
 */
export function decideSync(state: SyncState, remoteUpdatedAt: string | null): SyncDecision {
	if (!isDirty(state)) {
		return { action: 'skip', reason: 'not-dirty' };
	}

	const base = toEpoch(state.shopifyUpdatedAt);
	if (base === null) {
		// We have local edits but no known Shopify base — can't prove we won't
		// clobber. Require a pull/import to establish the base first.
		return { action: 'needs-base' };
	}

	const remote = toEpoch(remoteUpdatedAt);
	if (remote === null) {
		// Shopify has no row (deleted there?) — treat as conflict for human review
		return { action: 'conflict', base: state.shopifyUpdatedAt, remote: remoteUpdatedAt };
	}

	if (remote === base) {
		return { action: 'push' };
	}

	if (remote < base) {
		// Our base is newer than what Shopify reports — unexpected; surface it
		return { action: 'conflict', base: state.shopifyUpdatedAt, remote: remoteUpdatedAt };
	}

	// remote > base: Shopify changed since we last synced — would overwrite newer data
	return { action: 'conflict', base: state.shopifyUpdatedAt, remote: remoteUpdatedAt };
}
