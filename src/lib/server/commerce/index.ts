import type { AppSettings } from '$lib/server/settings';
import { shopifyCatalog } from './shopify';
import { noneCatalog } from './none';
import type { CatalogSync } from './types';

/**
 * Resolve the active catalog-sync provider. The kill switch lives here: when the
 * integration is off, callers transparently get the no-op provider. When more
 * providers exist, branch on a `settings.catalogProvider` here.
 */
export function getCatalogSync(settings: AppSettings): CatalogSync {
	return settings.syncEnabled ? shopifyCatalog : noneCatalog;
}

export type { CatalogSync, ImportStep, ImportStepResult, PushResult } from './types';
