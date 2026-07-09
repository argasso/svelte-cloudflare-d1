<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Cloudflare Turnstile widget. When the sitekey is set, the Turnstile script
	 * auto-renders any `.cf-turnstile` element and injects a hidden input named
	 * `cf-turnstile-response` inside it — that input submits with the surrounding
	 * form. When no sitekey (local dev), renders nothing and the server verifier
	 * passes transparently.
	 */
	let { siteKey }: { siteKey: string | null } = $props();

	onMount(() => {
		if (!siteKey) return;
		if (document.querySelector('script[data-turnstile]')) return;
		const s = document.createElement('script');
		s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
		s.async = true;
		s.defer = true;
		s.dataset.turnstile = 'true';
		document.head.appendChild(s);
	});
</script>

{#if siteKey}
	<!-- Turnstile appends a hidden input into this container on load, so the
	     surrounding form's FormData carries `cf-turnstile-response`. -->
	<div class="cf-turnstile" data-sitekey={siteKey}></div>
{/if}
