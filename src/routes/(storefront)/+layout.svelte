<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import StorefrontNav from '$lib/components/StorefrontNav.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import Search from '@lucide/svelte/icons/search';
	import { page } from '$app/stores';
	// Argasso wordmark (Albertus, outlined paths) — inlined so `currentColor`
	// renders it white on the gradient header. See .claude/skills/argasso-design.
	import logoSvg from '$lib/assets/logo.svg?raw';

	let { children, data } = $props();

	// Seed the header search box from ?q= when already on /sok.
	const headerQ = $derived($page.url.pathname === '/sok' ? ($page.url.searchParams.get('q') ?? '') : '');
</script>

<div class="min-h-screen flex flex-col">
	<!-- Header: brand gradient band, white logo + controls -->
	<header class="gradient text-white">
		<div class="container mx-auto px-4">
			<div class="flex items-center gap-4 h-16">
				<StorefrontNav nav={data.nav} />
				<a
					href="/"
					class="flex items-center text-white [&_svg]:h-8 [&_svg]:w-auto"
					aria-label="Argasso – till startsidan"
				>
					{@html logoSvg}
				</a>

				<nav class="hidden md:flex items-center gap-6">
					{#each data.nav as item (item.id)}
						<div class="group relative">
							<a
								href={item.href}
								class="inline-flex items-center gap-1 py-2 text-sm text-white/90 hover:text-white hover:underline"
							>
								{item.label}
								{#if item.children.length > 0}
									<ChevronDown class="h-3.5 w-3.5 opacity-70" />
								{/if}
							</a>
							{#if item.children.length > 0}
								<div
									class="invisible absolute left-0 top-full z-20 min-w-48 rounded-md border bg-background p-1 text-foreground opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100"
								>
									{#each item.children as child (child.id)}
										<a href={child.href} class="block rounded px-3 py-2 text-sm hover:bg-accent">
											{child.label}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</nav>

				<div class="ml-auto flex items-center gap-2">
					<!-- Global search: books, authors and pages → /sok -->
					<form action="/sok" role="search" class="hidden sm:block">
						<div class="relative">
							<Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
							<input
								name="q"
								type="search"
								value={headerQ}
								placeholder="Sök böcker, författare…"
								aria-label="Sök"
								class="h-9 w-44 rounded-md border border-white/30 bg-white/10 pl-8 pr-3 text-sm text-white transition-[width,background-color] placeholder:text-white/70 focus:w-64 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
							/>
						</div>
					</form>

					<a
						href="/sok"
						class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 sm:hidden"
						aria-label="Sök"
					>
						<Search class="h-5 w-5" />
					</a>
					<ThemeToggle class="text-white hover:bg-white/10 hover:text-white" />
					{#if data.commerceEnabled}
						<a
							href="/varukorg"
							class="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
							aria-label="Varukorg"
						>
							<ShoppingCart class="h-5 w-5" />
							{#if data.cartCount > 0}
								<span
									class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-primary"
								>
									{data.cartCount}
								</span>
							{/if}
						</a>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						href="/admin"
						class="text-white hover:bg-white/10 hover:text-white"
					>
						Admin
					</Button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="flex-1">
		{@render children()}
	</main>

	<!-- Footer: brand gradient band, generous spacing + clear hierarchy -->
	<footer class="gradient mt-16 text-gray-100">
		<div class="container mx-auto px-4 py-12">
			<div class="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3">
				<div>
					<h3 class="mb-4 text-xs font-semibold uppercase tracking-wider text-white/70">
						Kontaktuppgifter
					</h3>
					<address class="space-y-1 not-italic leading-relaxed text-gray-100/90">
						<p>Villagatan 34</p>
						<p>891 37 Örnsköldsvik</p>
						<p>0660 - 27 36 40</p>
					</address>
				</div>
				<div>
					<h3 class="mb-4 text-xs font-semibold uppercase tracking-wider text-white/70">
						Övrig information
					</h3>
					<ul class="space-y-2">
						<li><a href="/om-argasso" class="text-gray-100/90 hover:text-white hover:underline">Om Argasso</a></li>
						<li><a href="/press" class="text-gray-100/90 hover:text-white hover:underline">Press</a></li>
						<li><a href="/kontakta-oss" class="text-gray-100/90 hover:text-white hover:underline">Kontakta oss</a></li>
					</ul>
				</div>
				<div>
					<h3 class="mb-4 text-xs font-semibold uppercase tracking-wider text-white/70">Villkor</h3>
					<ul class="space-y-2">
						<li>
							<a href="/forsaljningsvillkor" class="text-gray-100/90 hover:text-white hover:underline">
								Försäljnings- och leveransvillkor
							</a>
						</li>
						<li>
							<a href="/integritetspolicy" class="text-gray-100/90 hover:text-white hover:underline">
								Integritetspolicy
							</a>
						</li>
					</ul>
				</div>
			</div>
			<div class="mt-12 border-t border-white/20 pt-6 text-sm text-gray-100/70">
				© 2026 Argasso bokförlag AB
			</div>
		</div>
	</footer>
</div>
