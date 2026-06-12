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
					<a href="/bocker" class="text-sm hover:underline">Böcker</a>
					<a href="/forfattare" class="text-sm hover:underline">Författare</a>
					<a href="/var-katalog" class="text-sm hover:underline">Vår katalog</a>
					<a href="/studiematerial" class="text-sm hover:underline">Studiematerial</a>
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
