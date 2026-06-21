import { eq, sql } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import type { ResolvedCart } from '$lib/server/cart';

/**
 * Atomically take the next value of a named counter (gapless sequence). The
 * UPDATE … RETURNING is a single statement, so concurrent callers each get a
 * distinct value.
 */
async function nextCounter(db: DbClient, name: string): Promise<number> {
	await db.insert(schema.counter).values({ name, value: 0 }).onConflictDoNothing();
	const [row] = await db
		.update(schema.counter)
		.set({ value: sql`${schema.counter.value} + 1` })
		.where(eq(schema.counter.name, name))
		.returning({ value: schema.counter.value });
	return row.value;
}

/** Create a pending order (+ items) from a resolved cart. Returns the order id. */
export async function createPendingOrder(db: DbClient, cart: ResolvedCart): Promise<number> {
	const [created] = await db
		.insert(schema.order)
		.values({
			status: 'pending',
			subtotal: cart.subtotal,
			shipping: cart.shipping,
			vatAmount: cart.vatAmount,
			total: cart.total,
			currency: 'SEK'
		})
		.returning({ id: schema.order.id });

	const orderId = created.id;
	await db.insert(schema.orderItem).values(
		cart.items.map((i) => ({
			orderId,
			variantId: i.variantId,
			productId: i.productId,
			title:
				i.variantTitle && i.variantTitle !== 'Default Title'
					? `${i.title} – ${i.variantTitle}`
					: i.title,
			unitPrice: i.unitPrice,
			quantity: i.qty,
			lineTotal: i.lineTotal
		}))
	);
	return orderId;
}

export type PaidOrderInfo = {
	paymentIntentId: string | null;
	email: string | null;
	customerName: string | null;
	shippingAddress: schema.Order['shippingAddress'];
};

/**
 * Mark an order paid and decrement inventory. Idempotent: a repeated webhook for
 * an already-paid order is a no-op (inventory isn't decremented twice).
 * Returns the order (with items) only when it NEWLY transitioned to paid — so
 * the caller can send the confirmation email exactly once — else null.
 */
export async function markOrderPaid(
	db: DbClient,
	orderId: number,
	info: PaidOrderInfo
): Promise<(schema.Order & { items: schema.OrderItem[] }) | null> {
	const ord = await db.query.order.findFirst({
		where: eq(schema.order.id, orderId),
		with: { items: true }
	});
	if (!ord) return null;
	if (ord.status === 'paid' || ord.status === 'fulfilled') return null;

	// Gapless receipt number, assigned once at the paid transition.
	const receiptNumber = ord.receiptNumber ?? (await nextCounter(db, 'receipt'));

	await db
		.update(schema.order)
		.set({
			status: 'paid',
			stripePaymentIntentId: info.paymentIntentId,
			email: info.email,
			customerName: info.customerName,
			shippingAddress: info.shippingAddress,
			receiptNumber,
			updatedAt: new Date().toISOString()
		})
		.where(eq(schema.order.id, orderId));

	for (const it of ord.items) {
		await db
			.update(schema.variant)
			.set({
				inventoryQuantity: sql`MAX(0, COALESCE(${schema.variant.inventoryQuantity}, 0) - ${it.quantity})`
			})
			.where(eq(schema.variant.id, it.variantId));
	}

	// Return the freshly-paid order so the caller can email a confirmation.
	return {
		...ord,
		status: 'paid',
		email: info.email,
		customerName: info.customerName,
		shippingAddress: info.shippingAddress,
		stripePaymentIntentId: info.paymentIntentId,
		receiptNumber
	};
}

/**
 * Record a refund against an order (the Stripe refund must already have
 * succeeded). Accumulates `refundedAmount`; once it reaches the total the order
 * becomes `refunded` and inventory is restocked exactly once. Returns the
 * updated order (with items) for the confirmation email.
 */
export async function recordRefund(
	db: DbClient,
	orderId: number,
	amount: number,
	refundId: string
): Promise<(schema.Order & { items: schema.OrderItem[] }) | null> {
	const ord = await db.query.order.findFirst({
		where: eq(schema.order.id, orderId),
		with: { items: true }
	});
	if (!ord) return null;

	const refundedAmount = Math.min(ord.refundedAmount + amount, ord.total);
	const fullyRefunded = refundedAmount >= ord.total;
	const wasRefunded = ord.status === 'refunded';

	await db
		.update(schema.order)
		.set({
			refundedAmount,
			stripeRefundId: refundId,
			refundedAt: new Date().toISOString(),
			status: fullyRefunded ? 'refunded' : ord.status,
			updatedAt: new Date().toISOString()
		})
		.where(eq(schema.order.id, orderId));

	// Restock when the order first becomes fully refunded (reverse the sale).
	if (fullyRefunded && !wasRefunded) {
		for (const it of ord.items) {
			await db
				.update(schema.variant)
				.set({
					inventoryQuantity: sql`COALESCE(${schema.variant.inventoryQuantity}, 0) + ${it.quantity}`
				})
				.where(eq(schema.variant.id, it.variantId));
		}
	}

	return { ...ord, refundedAmount, stripeRefundId: refundId, status: fullyRefunded ? 'refunded' : ord.status };
}
