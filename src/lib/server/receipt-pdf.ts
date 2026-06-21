import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Order, OrderItem } from '$lib/db/schema';
import { seller, vatBreakdown, formatReceiptNumber, VAT_RATE } from './receipt';

const kr = (ore: number) =>
	`${(ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`;

/**
 * Render a receipt PDF (pure JS via pdf-lib, runs on the Workers runtime).
 * Uses Helvetica (WinAnsi) which covers Swedish å/ä/ö. Returns the bytes.
 */
export async function generateReceiptPdf(
	order: Order & { items: OrderItem[] }
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([420, 595]); // A5-ish portrait
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const { width, height } = page.getSize();
	const M = 40;
	const grey = rgb(0.45, 0.45, 0.45);
	const black = rgb(0.1, 0.1, 0.1);

	let y = height - M;
	const text = (
		s: string,
		x: number,
		yy: number,
		opts: { font?: PDFFont; size?: number; color?: typeof black } = {}
	) => page.drawText(s, { x, y: yy, font: opts.font ?? font, size: opts.size ?? 9, color: opts.color ?? black });
	const right = (s: string, xRight: number, yy: number, f: PDFFont = font, size = 9) =>
		page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, font: f, size, color: black });
	const line = (yy: number) =>
		page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.5, color: grey });

	// Header
	text(seller.name, M, y, { font: bold, size: 14 });
	right('Kvitto', width - M, y, bold, 12);
	y -= 16;
	for (const l of seller.addressLines) {
		text(l, M, y, { color: grey });
		y -= 12;
	}
	text(seller.phone, M, y, { color: grey });

	// Receipt meta (right column)
	let my = height - M - 30;
	right(`Nr: ${formatReceiptNumber(order.receiptNumber)}`, width - M, my);
	my -= 12;
	right(`Datum: ${new Date(order.createdAt).toLocaleDateString('sv-SE')}`, width - M, my);
	my -= 12;
	right(`Order #${order.id}`, width - M, my, font, 9);
	my -= 12;
	if (seller.orgNumber) {
		right(`Org.nr: ${seller.orgNumber}`, width - M, my, font, 8);
		my -= 11;
	}
	if (seller.vatNumber) right(`Momsreg.nr: ${seller.vatNumber}`, width - M, my, font, 8);

	y -= 28;

	// Customer
	if (order.customerName || order.shippingAddress || order.email) {
		text('Kund', M, y, { font: bold });
		y -= 13;
		const a = order.shippingAddress;
		const lines = [
			order.customerName,
			a?.line1,
			a?.line2,
			a ? [a.postalCode, a.city].filter(Boolean).join(' ') : null,
			order.email
		].filter((s): s is string => !!s);
		for (const l of lines) {
			text(l, M, y, { color: grey });
			y -= 12;
		}
		y -= 6;
	}

	// Items
	line(y);
	y -= 14;
	text('Artikel', M, y, { font: bold, size: 8, color: grey });
	right('Antal', width - 160, y, bold, 8);
	right('Pris', width - 100, y, bold, 8);
	right('Summa', width - M, y, bold, 8);
	y -= 6;
	line(y);
	y -= 14;

	const drawItem = (p: PDFPage, label: string, qty: string, price: string, sum: string) => {
		page.drawText(label, { x: M, y, size: 9, font, color: black, maxWidth: width - 200 });
		if (qty) right(qty, width - 160, y);
		if (price) right(price, width - 100, y);
		right(sum, width - M, y);
	};
	for (const it of order.items) {
		drawItem(page, it.title.slice(0, 48), String(it.quantity), kr(it.unitPrice), kr(it.lineTotal));
		y -= 14;
	}
	if (order.shipping > 0) {
		drawItem(page, 'Frakt', '', '', kr(order.shipping));
		y -= 14;
	}

	// Totals
	const vat = vatBreakdown(order);
	y -= 4;
	line(y);
	y -= 16;
	const tx = width - 170;
	text('Netto', tx, y, { color: grey });
	right(kr(vat.net), width - M, y);
	y -= 13;
	text(`Moms (${Math.round(VAT_RATE * 100)} %)`, tx, y, { color: grey });
	right(kr(vat.vat), width - M, y);
	y -= 15;
	text('Att betala', tx, y, { font: bold, size: 11 });
	right(kr(vat.gross), width - M, y, bold, 11);
	if (order.refundedAmount > 0) {
		y -= 14;
		text('Återbetalat', tx, y, { color: rgb(0.7, 0.1, 0.1) });
		right(`-${kr(order.refundedAmount)}`, width - M, y, font, 9);
	}

	text('Tack för ditt köp! · Betald via Stripe', M, M, { color: grey, size: 8 });

	return doc.save();
}

/** Uint8Array → base64 (chunked, Workers-safe) for email attachments. */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
