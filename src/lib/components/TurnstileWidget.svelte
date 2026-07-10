<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Cloudflare Turnstile widget. Explicitly renders via `turnstile.render()` so
	 * it works on both first visit AND client-side navigation (the auto-scan only
	 * runs on api.js load, not on subsequent DOM mounts).
	 *
	 * The token is written to a hidden input named `turnstileToken` inside the
	 * container div; that field is validated server-side by verifyTurnstile.
	 * Without a site key (local dev), renders nothing and the server verifier
	 * passes transparently.
	 */
	let { siteKey }: { siteKey: string | null } = $props();

	let container = $state<HTMLDivElement>();
	let widgetId: string | undefined;

	function tryRender() {
		if (!container || !window.turnstile) return false;
		widgetId = window.turnstile.render(container, {
			sitekey: siteKey!,
			'response-field-name': 'turnstileToken'
		});
		return true;
	}

	onMount(() => {
		if (!siteKey || !container) return;

		if (tryRender()) return () => cleanup();

		// Script not loaded yet (or still loading) — inject if needed, then poll.
		if (!document.querySelector('script[data-turnstile]')) {
			const s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
			s.async = true;
			s.defer = true;
			s.dataset.turnstile = 'true';
			document.head.appendChild(s);
		}
		const iv = setInterval(() => {
			if (tryRender()) clearInterval(iv);
		}, 100);
		const timeout = setTimeout(() => clearInterval(iv), 8000);
		return () => {
			clearInterval(iv);
			clearTimeout(timeout);
			cleanup();
		};
	});

	function cleanup() {
		if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
		widgetId = undefined;
	}
</script>

{#if siteKey}
	<div bind:this={container}></div>
{/if}
