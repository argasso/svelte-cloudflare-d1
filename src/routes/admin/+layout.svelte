<script lang="ts">
	import { page } from '$app/stores';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Separator } from '$lib/components/ui/separator';
	import { SidebarInset, SidebarProvider, SidebarTrigger } from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	// Cloudflare Access protects /admin pages at the edge, but remote functions
	// are served from /_app/remote (not under /admin), so an expired session
	// surfaces there as a 401. Reload to re-trigger Access login instead of
	// showing an error — the session self-heals. (Runtime remote errors are
	// HTTP 200 with the real status in the JSON body.)
	onMount(() => {
		const original = window.fetch;
		let reloading = false;
		window.fetch = async (input, init) => {
			const res = await original(input, init);
			const url =
				typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
			if (!reloading && url.includes('/_app/remote/')) {
				res
					.clone()
					.json()
					.then((body) => {
						if (body?.type === 'error' && body?.status === 401) {
							reloading = true;
							location.reload();
						}
					})
					.catch(() => {});
			}
			return res;
		};
		return () => {
			window.fetch = original;
		};
	});

	// Build breadcrumbs from pathname
	const breadcrumbs = $derived.by(() => {
		const segments = $page.url.pathname.split('/').filter(Boolean);
		const crumbs = segments.map((segment, i) => {
			const href = '/' + segments.slice(0, i + 1).join('/');
			const label = segment.charAt(0).toUpperCase() + segment.slice(1);
			return { href, label };
		});
		return crumbs;
	});
</script>

<SidebarProvider>
	<AppSidebar user={data.user} syncEnabled={data.syncEnabled} />
	<SidebarInset>
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<SidebarTrigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 h-4" />
			<Breadcrumb.Root>
				<Breadcrumb.List>
					{#each breadcrumbs as crumb, i (crumb.href)}
						<Breadcrumb.Item>
							{#if i === breadcrumbs.length - 1}
								<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
							{:else}
								<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
							{/if}
						</Breadcrumb.Item>
						{#if i < breadcrumbs.length - 1}
							<Breadcrumb.Separator />
						{/if}
					{/each}
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<div class="ml-auto flex items-center gap-2">
				<ThemeToggle />
				<Button variant="outline" size="sm" href="/">
					<ExternalLink class="mr-2 h-4 w-4" />
					Visa webbplats
				</Button>
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4">
			{@render children()}
		</div>
	</SidebarInset>
</SidebarProvider>
