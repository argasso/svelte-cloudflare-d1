<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { children, data } = $props();
</script>

<div class="min-h-screen flex flex-col">
	<!-- Header -->
	<header class="border-b">
		<div class="container mx-auto px-4">
			<div class="flex items-center justify-between h-16">
				<a href="/" class="text-xl font-bold">Argasso bokförlag</a>

				<nav class="hidden md:flex gap-6">
					{#each data.nav as item (item.id)}
						<div class="group relative">
							<a href={item.href} class="text-sm hover:underline">{item.label}</a>
							{#if item.children.length > 0}
								<div
									class="invisible absolute left-0 top-full z-10 min-w-44 rounded-md border bg-background p-1 opacity-0 shadow-md transition group-hover:visible group-hover:opacity-100"
								>
									{#each item.children as child (child.id)}
										<a href={child.href} class="block rounded px-3 py-1.5 text-sm hover:bg-accent">
											{child.label}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</nav>

				<div class="flex gap-2">
					<Button variant="ghost" size="sm" href="/admin">Admin</Button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="flex-1">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t mt-12">
		<div class="container mx-auto px-4 py-8">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
				<div>
					<h3 class="font-bold mb-3">Kontaktuppgifter</h3>
					<div class="space-y-1 text-muted-foreground">
						<p>Villagatan 34</p>
						<p>891 37 Örnsköldsvik</p>
						<p>0660 - 27 36 40</p>
					</div>
				</div>
				<div>
					<h3 class="font-bold mb-3">Övrig information</h3>
					<div class="space-y-1">
						<a href="/om-argasso" class="block hover:underline">Om Argasso</a>
						<a href="/press" class="block hover:underline">Press</a>
						<a href="/kontakta-oss" class="block hover:underline">Kontakta oss</a>
					</div>
				</div>
				<div>
					<h3 class="font-bold mb-3">Villkor</h3>
					<div class="space-y-1">
						<a href="/forsaljningsvillkor" class="block hover:underline">
							Försäljnings- och leveransvilkor
						</a>
						<a href="/integritetspolicy" class="block hover:underline">Integritetspolicy</a>
					</div>
				</div>
			</div>
			<div class="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
				© 2026 Argasso bokförlag AB
			</div>
		</div>
	</footer>
</div>
