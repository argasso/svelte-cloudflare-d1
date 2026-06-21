import { env } from '$env/dynamic/private';
import type { Order, OrderItem } from '$lib/db/schema';

/**
 * Transactional email via Resend's HTTP API (fetch-based — no SDK, runs on the
 * Workers runtime). Inert unless RESEND_API_KEY + ORDER_EMAIL_FROM are set, so
 * the checkout flow never fails for a missing email config.
 *
 * Env: RESEND_API_KEY, ORDER_EMAIL_FROM ("Argasso <order@argasso.se>"),
 *      ORDER_NOTIFY_EMAIL (optional shop copy).
 */
export function emailEnabled(): boolean {
	return !!env.RESEND_API_KEY && !!env.ORDER_EMAIL_FROM;
}

type SendArgs = { to: string; subject: string; html: string; replyTo?: string };

async function send({ to, subject, html, replyTo }: SendArgs): Promise<void> {
	if (!emailEnabled()) return;
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.RESEND_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			from: env.ORDER_EMAIL_FROM,
			to,
			subject,
			html,
			...(replyTo ? { reply_to: replyTo } : {})
		})
	});
	if (!res.ok) {
		throw new Error(`Resend ${res.status}: ${await res.text()}`);
	}
}

const kr = (ore: number) => `${(ore / 100).toLocaleString('sv-SE')} kr`;
const esc = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function orderHtml(order: Order, items: OrderItem[]): string {
	const rows = items
		.map(
			(i) =>
				`<tr><td style="padding:4px 0">${i.quantity} × ${esc(i.title)}</td><td style="padding:4px 0;text-align:right">${kr(i.lineTotal)}</td></tr>`
		)
		.join('');
	const addr = order.shippingAddress;
	const addrHtml = addr
		? `<p style="color:#555">${esc(order.customerName ?? '')}<br>${esc(addr.line1 ?? '')}<br>${esc([addr.postalCode, addr.city].filter(Boolean).join(' '))}<br>${esc(addr.country ?? '')}</p>`
		: '';
	return `
		<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
			<h1 style="font-size:20px">Tack för din beställning!</h1>
			<p>Din order <strong>#${order.id}</strong> är bekräftad och betald.</p>
			<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
			<table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;padding-top:8px">
				<tr><td style="padding:2px 0;color:#555">Delsumma</td><td style="text-align:right">${kr(order.subtotal)}</td></tr>
				<tr><td style="padding:2px 0;color:#555">Frakt</td><td style="text-align:right">${order.shipping === 0 ? 'Fri' : kr(order.shipping)}</td></tr>
				<tr><td style="padding:6px 0;font-weight:bold">Totalt</td><td style="text-align:right;font-weight:bold">${kr(order.total)}</td></tr>
			</table>
			<p style="color:#888;font-size:12px">Varav moms (6 %): ${kr(order.vatAmount)}</p>
			${addrHtml}
			<p style="color:#888;font-size:12px;margin-top:24px">Argasso bokförlag</p>
		</div>`;
}

/**
 * Send the order confirmation to the customer (and a copy to the shop, if
 * ORDER_NOTIFY_EMAIL is set). Best-effort: errors are logged, never thrown, so
 * a mail hiccup can't fail the payment webhook.
 */
export async function sendOrderConfirmation(order: Order, items: OrderItem[]): Promise<void> {
	if (!emailEnabled()) return;
	const html = orderHtml(order, items);
	try {
		if (order.email) {
			await send({ to: order.email, subject: `Orderbekräftelse #${order.id} – Argasso`, html });
		}
		if (env.ORDER_NOTIFY_EMAIL) {
			await send({
				to: env.ORDER_NOTIFY_EMAIL,
				subject: `Ny order #${order.id}${order.email ? ` – ${order.email}` : ''}`,
				html,
				replyTo: order.email ?? undefined
			});
		}
	} catch (e) {
		console.error('order confirmation email failed', order.id, e);
	}
}

/** Notify the customer that a refund was issued. Best-effort; never throws. */
export async function sendRefundConfirmation(order: Order, amount: number): Promise<void> {
	if (!emailEnabled() || !order.email) return;
	const full = amount >= order.total;
	const html = `
		<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
			<h1 style="font-size:20px">Återbetalning för order #${order.id}</h1>
			<p>Vi har återbetalat <strong>${kr(amount)}</strong>${full ? '' : ' (delåterbetalning)'} till ditt betalkort. Beloppet syns normalt inom några bankdagar.</p>
			<p style="color:#888;font-size:12px;margin-top:24px">Argasso bokförlag</p>
		</div>`;
	try {
		await send({ to: order.email, subject: `Återbetalning #${order.id} – Argasso`, html });
	} catch (e) {
		console.error('refund email failed', order.id, e);
	}
}
