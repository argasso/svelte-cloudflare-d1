<script lang="ts">
	import { Drawer } from 'vaul-svelte';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import type { NavNode } from '$lib/server/storefront/nav';

	// Mobile navigation drawer (the desktop top menu is rendered in the layout).
	let { nav }: { nav: NavNode[] } = $props();

	let open = $state(false);
</script>

<Drawer.Root bind:open direction="left">
	<Drawer.Trigger
		class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent md:hidden"
		aria-label="Öppna meny"
	>
		<Menu class="h-5 w-5" />
	</Drawer.Trigger>
	<Drawer.Portal>
		<Drawer.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Drawer.Content
			class="fixed inset-y-0 left-0 z-50 flex w-3/4 max-w-xs flex-col bg-background shadow-xl"
		>
			<div class="flex items-center justify-between border-b p-4">
				<span class="font-bold">Meny</span>
				<Drawer.Close
					class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					aria-label="Stäng meny"
				>
					<X class="h-5 w-5" />
				</Drawer.Close>
			</div>
			<nav class="flex-1 overflow-y-auto p-2">
				{#each nav as item (item.id)}
					<a
						href={item.href}
						onclick={() => (open = false)}
						class="block rounded px-3 py-2 font-medium hover:bg-accent"
					>
						{item.label}
					</a>
					{#if item.children.length > 0}
						<div class="mb-1 ml-3 border-l pl-2">
							{#each item.children as child (child.id)}
								<a
									href={child.href}
									onclick={() => (open = false)}
									class="block rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									{child.label}
								</a>
							{/each}
						</div>
					{/if}
				{/each}
			</nav>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
