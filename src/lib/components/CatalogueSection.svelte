<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import Download from '@lucide/svelte/icons/download';
	import { requestPrintCatalogue } from '../../routes/(storefront)/catalogue.remote';

	let {
		catalogue,
		turnstileSiteKey,
		justOrdered
	}: {
		catalogue: {
			r2Key: string;
			filename: string;
			sizeBytes: number;
			uploadedAt: string;
		} | null;
		turnstileSiteKey: string | null;
		justOrdered: boolean;
	} = $props();

	const submit = requestPrintCatalogue.for('catalogue-request');

	// Local state (button + inline error). Success is driven by the URL
	// (justOrdered from ?ordered=1) — after a successful submit we goto() that
	// URL, and the parent load flips justOrdered to true. Simple and reliable.
	let submitting = $state(false);
	let serverError = $state<string | null>(null);

	// Reset the Turnstile widget when the server rejects (tokens are single-use).
	let turnstileResetSignal = $state(0);
	$effect(() => {
		if (serverError) turnstileResetSignal++;
	});

	// Fallback when native `required` blocks submit but the browser's popup is
	// clipped/off-screen. `invalid` fires on the offending field but doesn't
	// bubble, hence the capture-phase listener on the form.
	let requiredMissing = $state(false);
	const onInvalidCapture = () => (requiredMissing = true);
	const onInputCapture = () => {
		if (requiredMissing) requiredMissing = false;
	};

	const kb = $derived(catalogue ? Math.round(catalogue.sizeBytes / 1024) : 0);
	const mb = $derived(kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' kB');
</script>

<div class="grid gap-8 md:grid-cols-2">
	<!-- PDF download -->
	<section class="rounded-lg border p-6">
		<h2 class="text-2xl font-semibold">Ladda ner katalogen</h2>
		{#if catalogue}
			<p class="mt-2 text-sm text-muted-foreground">
				Vår aktuella katalog som PDF ({mb}).
			</p>
			<Button href="/media/{catalogue.r2Key}" class="mt-4" download={catalogue.filename}>
				<Download class="mr-2 h-4 w-4" />
				Ladda ner ({mb})
			</Button>
		{:else}
			<p class="mt-2 text-sm text-muted-foreground">
				Den digitala katalogen är inte tillgänglig just nu. Beställ gärna den tryckta versionen
				till höger.
			</p>
		{/if}
	</section>

	<!-- Print catalogue order form -->
	<section class="rounded-lg border p-6">
		<h2 class="text-2xl font-semibold">Beställ tryckt katalog</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Vi skickar den tryckta katalogen kostnadsfritt inom Sverige.
		</p>

		{#if justOrdered}
			<div class="mt-4 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
				<p class="font-semibold">Tack för din beställning!</p>
				<p class="mt-1">Katalogen är på väg med posten inom kort.</p>
			</div>
		{:else}
			<form
				{...submit.enhance(async ({ submit: run }) => {
					requiredMissing = false;
					serverError = null;
					submitting = true;
					try {
						await run();
						// Success — hard-navigate to ?ordered=1. `goto()` with
						// invalidateAll: true silently failed to re-render (the load ran
						// but the component tree didn't update); location.assign forces a
						// full page load and can't miss.
						window.location.assign(`${window.location.pathname}?ordered=1`);
						// Halt further work; the browser is about to reload.
						return;
					} catch (e) {
						const err = e as { body?: { message?: string }; message?: string };
						serverError =
							err?.body?.message ??
							err?.message ??
							'Något gick fel. Försök igen om en stund.';
					} finally {
						submitting = false;
					}
				})}
				oninvalidcapture={onInvalidCapture}
				oninputcapture={onInputCapture}
				class="mt-4 space-y-4"
			>
				<!-- Honeypot: hidden from users, catnip to bots -->
				<div
					class="pointer-events-none absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden"
					aria-hidden="true"
				>
					<label>
						Företag
						<input type="text" name="company" tabindex="-1" autocomplete="off" />
					</label>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label for="cat-name">Namn *</Label>
						<Input id="cat-name" {...submit.fields.name.as('text', '')} required />
						{#each submit.fields.name.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
					<div class="space-y-1.5">
						<Label for="cat-email">E-post *</Label>
						<Input
							id="cat-email"
							type="email"
							autocomplete="email"
							{...submit.fields.email.as('text', '')}
							required
						/>
						{#each submit.fields.email.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="cat-addr1">Adress *</Label>
					<Input
						id="cat-addr1"
						autocomplete="address-line1"
						{...submit.fields.addressLine1.as('text', '')}
						required
					/>
					{#each submit.fields.addressLine1.issues() ?? [] as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-1.5">
					<Label for="cat-addr2">Adress (rad 2)</Label>
					<Input
						id="cat-addr2"
						autocomplete="address-line2"
						{...submit.fields.addressLine2.as('text', '')}
					/>
				</div>

				<div class="grid gap-4 sm:grid-cols-[8rem_1fr]">
					<div class="space-y-1.5">
						<Label for="cat-zip">Postnummer *</Label>
						<Input
							id="cat-zip"
							autocomplete="postal-code"
							{...submit.fields.postalCode.as('text', '')}
							required
						/>
						{#each submit.fields.postalCode.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
					<div class="space-y-1.5">
						<Label for="cat-city">Ort *</Label>
						<Input
							id="cat-city"
							autocomplete="address-level2"
							{...submit.fields.city.as('text', '')}
							required
						/>
						{#each submit.fields.city.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="cat-phone">Telefon (frivilligt)</Label>
					<Input id="cat-phone" type="tel" autocomplete="tel" {...submit.fields.phone.as('text', '')} />
				</div>

				<div class="space-y-1.5">
					<Label for="cat-note">Meddelande (frivilligt)</Label>
					<textarea
						id="cat-note"
						name="note"
						rows="3"
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					></textarea>
				</div>

				<TurnstileWidget siteKey={turnstileSiteKey} resetSignal={turnstileResetSignal} />

				{#if requiredMissing}
					<div
						role="alert"
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						Fyll i alla obligatoriska fält (markerade med *) och försök igen.
					</div>
				{/if}

				{#if serverError}
					<div
						role="alert"
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{serverError}
					</div>
				{/if}

				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Skickar…' : 'Skicka beställning'}
				</Button>
			</form>
		{/if}
	</section>
</div>
