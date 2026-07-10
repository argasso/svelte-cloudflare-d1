<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import Download from '@lucide/svelte/icons/download';
	import { requestPrintCatalogue } from '../../routes/(storefront)/catalogue.remote';

	/** Current catalogue metadata (R2 key + filename) and Turnstile site key. */
	let {
		catalogue,
		turnstileSiteKey
	}: {
		catalogue: {
			r2Key: string;
			filename: string;
			sizeBytes: number;
			uploadedAt: string;
		} | null;
		turnstileSiteKey: string | null;
	} = $props();

	const submit = requestPrintCatalogue.for('catalogue-request');

	// Local submitting flag: submit.pending doesn't reset reliably when the
	// handler rejects via invalid(), leaving the button stuck disabled/"Skickar…".
	// We toggle this ourselves in the enhance callback so it's always accurate.
	let submitting = $state(false);

	// Turnstile errors surface as issues on the turnstileToken field (via
	// invalid()). Reset the widget whenever a new issue appears so the user
	// can pass a fresh challenge — tokens are single-use.
	const turnstileIssues = $derived(submit.fields.turnstileToken.issues() ?? []);
	let turnstileResetSignal = $state(0);
	$effect(() => {
		if (turnstileIssues.length > 0) {
			turnstileResetSignal++;
			// Belt-and-suspenders: force-clear submitting the moment a failure
			// lands, in case the enhance callback's finally didn't fire on this
			// path (invalid() has left the button stuck without this).
			submitting = false;
		}
	});

	// Fallback when native `required` blocks submit but the browser's popup is
	// clipped/off-screen. `invalid` fires on the offending field but doesn't
	// bubble, hence the capture-phase listener on the form. Clear on next input
	// so the alert doesn't stick around after the user starts fixing it.
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

		{#if submit.result?.success}
			<div class="mt-4 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
				<p class="font-semibold">Tack för din beställning!</p>
				<p class="mt-1">Katalogen är på väg med posten inom kort.</p>
			</div>
		{:else}
			<form
				{...submit.enhance(async ({ submit: run }) => {
					requiredMissing = false;
					submitting = true;
					try {
						await run();
					} catch {
						/* issues are populated via .fields.<name>.issues() */
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
					<Input id="cat-addr2" autocomplete="address-line2" {...submit.fields.addressLine2.as('text', '')} />
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

				{#each turnstileIssues as issue (issue.message)}
					<div
						role="alert"
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{issue.message}
					</div>
				{/each}

				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Skickar…' : 'Skicka beställning'}
				</Button>
			</form>
		{/if}
	</section>
</div>
