import { env } from '$env/dynamic/private';
import type { Order } from '$lib/db/schema';

/**
 * Seller details for receipts. Name/address are public (same as the storefront
 * footer); the org number and VAT (moms) number come from non-secret env vars
 * (ORG_NUMBER, VAT_NUMBER) so they're easy to set without a code change.
 */
export const seller = {
	name: 'Argasso bokförlag AB',
	addressLines: ['Villagatan 34', '891 37 Örnsköldsvik'],
	phone: '0660 - 27 36 40',
	get orgNumber() {
		return env.ORG_NUMBER ?? '';
	},
	get vatNumber() {
		return env.VAT_NUMBER ?? '';
	}
};

/** Swedish book VAT rate (also applies to the postage of those books). */
export const VAT_RATE = 0.06;

/**
 * VAT breakdown for a receipt. The order total is VAT-inclusive at 6% (books and
 * their shipping share the rate), so we derive net + VAT from the gross total —
 * keeping net + VAT === total exactly.
 */
export function vatBreakdown(order: Pick<Order, 'total'>) {
	const gross = order.total;
	const net = Math.round(gross / (1 + VAT_RATE));
	return { net, vat: gross - net, gross, rate: VAT_RATE };
}

/** Display form of a receipt number, e.g. 1 → "2026-000001" is overkill; keep it simple. */
export function formatReceiptNumber(n: number | null): string {
	return n == null ? '—' : String(n).padStart(6, '0');
}
