<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		title: string;
		description?: string;
		/** Image URL or same-origin path; made absolute for OG/Twitter. */
		image?: string | null;
		type?: 'website' | 'article' | 'product';
		noindex?: boolean;
		/** Use verbatim as the <title> (e.g. a hand-written SEO title) instead of "{title} | site". */
		fullTitle?: string | null;
	}

	let {
		title,
		description = '',
		image = null,
		type = 'website',
		noindex = false,
		fullTitle: fullTitleOverride = null
	}: Props = $props();

	const SITE = 'Argasso bokförlag';
	const fullTitle = $derived(fullTitleOverride || (title ? `${title} | ${SITE}` : SITE));
	// Canonical: self-referential without query (paginated lists collapse to base).
	const canonical = $derived($page.url.origin + $page.url.pathname);
	const ogImage = $derived(
		image ? (image.startsWith('http') ? image : $page.url.origin + image) : null
	);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	{#if description}<meta name="description" content={description} />{/if}
	{#if noindex}<meta name="robots" content="noindex,nofollow" />{/if}
	<link rel="canonical" href={canonical} />

	<meta property="og:site_name" content={SITE} />
	<meta property="og:title" content={fullTitle} />
	{#if description}<meta property="og:description" content={description} />{/if}
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonical} />
	<meta property="og:locale" content="sv_SE" />
	{#if ogImage}<meta property="og:image" content={ogImage} />{/if}

	<meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={fullTitle} />
	{#if description}<meta name="twitter:description" content={description} />{/if}
	{#if ogImage}<meta name="twitter:image" content={ogImage} />{/if}
</svelte:head>
