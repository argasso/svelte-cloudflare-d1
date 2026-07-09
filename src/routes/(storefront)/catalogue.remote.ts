import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import * as schema from '$lib/db/schema';
import { sendCatalogueRequestNotification } from '$lib/server/email';
import { verifyTurnstile } from '$lib/server/turnstile';

/**
 * Print catalogue order form. Validates + Turnstile-checks the submission,
 * persists it to `catalogue_request`, then fires the staff notification email
 * (best-effort — the DB row is the source of truth). A hidden honeypot field
 * (`company`) short-circuits obvious bots without hitting Turnstile.
 */
const nonEmpty = (label: string) => v.pipe(v.string(), v.trim(), v.minLength(1, `${label} krävs`));
const optionalTrim = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => s.trim() || null)
);

export const requestPrintCatalogue = form(
	v.object({
		name: nonEmpty('Namn'),
		email: v.pipe(nonEmpty('E-post'), v.email('Ogiltig e-postadress')),
		phone: optionalTrim,
		addressLine1: nonEmpty('Adress'),
		addressLine2: optionalTrim,
		postalCode: nonEmpty('Postnummer'),
		city: nonEmpty('Ort'),
		note: optionalTrim,
		// Honeypot: bots gleefully fill any labelled-looking input; humans don't
		// see it (visually hidden in the form). Non-empty = spam → 400.
		company: v.optional(v.string(), ''),
		// Turnstile widget token; validated server-side.
		'cf-turnstile-response': v.optional(v.string(), '')
	}),
	async (payload) => {
		if (payload.company.trim()) error(400, 'Ogiltig begäran');

		const event = getRequestEvent();
		const ip =
			event.request.headers.get('cf-connecting-ip') ??
			event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
			null;

		const ok = await verifyTurnstile(payload['cf-turnstile-response'] || null, ip);
		if (!ok) error(400, 'Verifieringen misslyckades. Ladda om sidan och försök igen.');

		const [row] = await event.locals.db
			.insert(schema.catalogueRequest)
			.values({
				name: payload.name,
				email: payload.email,
				phone: payload.phone,
				addressLine1: payload.addressLine1,
				addressLine2: payload.addressLine2,
				postalCode: payload.postalCode,
				city: payload.city,
				note: payload.note,
				ipAddress: ip
			})
			.returning();

		await sendCatalogueRequestNotification({
			id: row.id,
			name: row.name,
			email: row.email,
			phone: row.phone,
			addressLine1: row.addressLine1,
			addressLine2: row.addressLine2,
			postalCode: row.postalCode,
			city: row.city,
			note: row.note
		});

		return { success: true, id: row.id };
	}
);
