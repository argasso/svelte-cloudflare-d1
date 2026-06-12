<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import GalleryVerticalEnd from '@lucide/svelte/icons/gallery-vertical-end';
	import Package from '@lucide/svelte/icons/package';
	import User from '@lucide/svelte/icons/user';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Settings from '@lucide/svelte/icons/settings';

	interface Props {
		user?: {
			email: string;
			name?: string;
		};
	}

	let { user }: Props = $props();

	const navItems = [
		{
			title: 'Products',
			url: '/admin/products',
			icon: Package
		},
		{
			title: 'Authors',
			url: '/admin/authors',
			icon: User
		},
		{
			title: 'Pages & Categories',
			url: '/admin/pages',
			icon: FolderTree
		},
		{
			title: 'Sync',
			url: '/admin/sync',
			icon: RefreshCw
		},
		{
			title: 'Settings',
			url: '/admin/settings',
			icon: Settings
		}
	];
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props }: any)}
						<a href="/admin" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<GalleryVerticalEnd class="size-4" />
							</div>
							<div class="flex flex-col gap-0.5 leading-none">
								<span class="font-semibold">Argasso Admin</span>
								{#if user}
									<span class="text-xs text-muted-foreground">{user.email}</span>
								{/if}
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each navItems as item}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props }: any)}
								<a href={item.url} {...props} class="flex items-center gap-2">
									<svelte:component this={item.icon} class="size-4" />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		{#if user}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						<div class="flex flex-col">
							<span class="text-sm font-medium">{user.name || user.email}</span>
							<span class="text-xs text-muted-foreground">{user.email}</span>
						</div>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{/if}
	</Sidebar.Footer>
</Sidebar.Root>
