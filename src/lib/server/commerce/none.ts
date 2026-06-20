import { error } from '@sveltejs/kit';
import type { CatalogSync } from './types';

/**
 * No-op catalog provider, used when the integration is turned off. The catalog
 * is then D1-only: nothing is imported or pushed, and inbound webhooks are
 * acknowledged but ignored.
 */
export const noneCatalog: CatalogSync = {
	id: 'none',
	enabled: false,
	async importStep() {
		error(409, 'Catalog sync is turned off in settings.');
	},
	async push() {
		return { summary: { pushed: 0, conflict: 0, failed: 0, skipped: 0 }, entries: [] };
	},
	async receiveWebhook() {
		return new Response('sync disabled', { status: 200 });
	}
};
