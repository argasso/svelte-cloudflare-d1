import { eq, sql } from 'drizzle-orm';
import * as schema from '$lib/db/schema';
import type { DbClient } from '$lib/server/db';
import type { ResolvedCart } from '$lib/server/cart';

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
 * an already-paid order is a no-op (so inventory isn't decremented twice).
 */
export async function markOrderPaid(
	db: DbClient,
	orderId: number,
	info: PaidOrderInfo
): Promise<boolean> {
	const ord = await db.query.order.findFirst({
		where: eq(schema.order.id, orderId),
		with: { items: true }
	});
	if (!ord) return false;
	if (ord.status === 'paid' || ord.status === 'fulfilled') return true;

	await db
		.update(schema.order)
		.set({
			status: 'paid',
			stripePaymentIntentId: info.paymentIntentId,
			email: info.email,
			customerName: info.customerName,
			shippingAddress: info.shippingAddress,
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
	return true;
}
