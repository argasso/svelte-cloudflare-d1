import { and, eq, inArray } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import { mediaSource, type MediaSource } from '$lib/utils/image';

/** A line in the cookie cart — just a variant reference + quantity. */
export type CartLine = { variantId: string; qty: number };

const COOKIE = 'cart';
const MAX_QTY = 99;

/** VAT-inclusive Swedish book rate, used to record the VAT portion of an order. */
export const BOOK_VAT_RATE = 0.06;
/** Flat shipping in öre, waived above the threshold. */
export const SHIPPING_FLAT = 4900;
export const FREE_SHIPPING_OVER = 50000;

export function readCart(cookies: Cookies): CartLine[] {
	const raw = cookies.get(COOKIE);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((x) => x && typeof x.variantId === 'string' && Number.isInteger(x.qty) && x.qty > 0)
			.map((x) => ({ variantId: x.variantId as string, qty: Math.min(x.qty as number, MAX_QTY) }));
	} catch {
		return [];
	}
}

export function writeCart(cookies: Cookies, lines: CartLine[]): void {
	if (lines.length === 0) {
		cookies.delete(COOKIE, { path: '/' });
		return;
	}
	cookies.set(COOKIE, JSON.stringify(lines), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});
}

/** Total item count (cheap — no DB), for the header badge. */
export function cartCount(cookies: Cookies): number {
	return readCart(cookies).reduce((n, l) => n + l.qty, 0);
}

export type ResolvedCartItem = {
	variantId: string;
	productId: number | null;
	title: string;
	variantTitle: string;
	qty: number;
	unitPrice: number; // öre, VAT-inclusive
	lineTotal: number; // öre
	cover: MediaSource | null;
};

export type ResolvedCart = {
	items: ResolvedCartItem[];
	count: number;
	subtotal: number; // öre
	shipping: number; // öre
	vatAmount: number; // öre (VAT portion of goods)
	total: number; // öre
};

const toOre = (sek: number) => Math.round(sek * 100);

/** Resolve cookie lines against D1 (authoritative prices) + compute amounts. */
export async function resolveCart(db: DbClient, lines: CartLine[]): Promise<ResolvedCart> {
	const empty: ResolvedCart = { items: [], count: 0, subtotal: 0, shipping: 0, vatAmount: 0, total: 0 };
	if (lines.length === 0) return empty;

	const variants = await db.query.variant.findMany({
		where: inArray(
			schema.variant.id,
			lines.map((l) => l.variantId)
		),
		with: { product: { columns: { id: true, title: true } }, image: true }
	});

	// Variant images may be null; fall back to the product's first media row.
	const productIds = variants.map((v) => v.productId);
	const covers = productIds.length
		? await db
				.select({
					entityId: schema.media.entityId,
					r2Key: schema.media.r2Key,
					migratedToR2: schema.media.migratedToR2,
					shopifyUrl: schema.media.shopifyUrl
				})
				.from(schema.media)
				.where(
					and(
						eq(schema.media.entityType, 'product'),
						inArray(
							schema.media.entityId,
							productIds.map((id) => String(id))
						)
					)
				)
				.orderBy(schema.media.position)
		: [];
	const coverByProduct = new Map<string, MediaSource>();
	for (const c of covers) if (!coverByProduct.has(c.entityId)) coverByProduct.set(c.entityId, c);

	const byId = new Map(variants.map((v) => [v.id, v]));
	const items: ResolvedCartItem[] = [];
	for (const line of lines) {
		const v = byId.get(line.variantId);
		if (!v) continue; // dropped variant — silently skip
		const unitPrice = toOre(v.price);
		items.push({
			variantId: v.id,
			productId: v.productId,
			title: v.product?.title ?? v.title,
			variantTitle: v.title,
			qty: line.qty,
			unitPrice,
			lineTotal: unitPrice * line.qty,
			cover: v.image ?? coverByProduct.get(String(v.productId)) ?? null
		});
	}

	const subtotal = items.reduce((n, i) => n + i.lineTotal, 0);
	const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
	const total = subtotal + shipping;
	// Books and their postage share the 6% rate, so VAT is the inclusive portion
	// of the whole total — keeping net + VAT === total (matches the receipt).
	const vatAmount = total - Math.round(total / (1 + BOOK_VAT_RATE));
	return {
		items,
		count: items.reduce((n, i) => n + i.qty, 0),
		subtotal,
		shipping,
		vatAmount,
		total
	};
}

/** mediaSource re-export so callers don't import two modules for the thumbnail. */
export { mediaSource };
