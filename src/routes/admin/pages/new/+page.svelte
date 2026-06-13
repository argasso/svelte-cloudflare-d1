<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { createPage } from '../pages.remote';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/pages">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">New Page</h1>
			<p class="text-muted-foreground">Add a page or book category</p>
		</div>
		<Button type="submit" form="page-form" disabled={!!createPage.pending}>
			<Plus class="mr-2 h-4 w-4" />
			Create Page
		</Button>
	</div>

	<form id="page-form" {...createPage} class="grid gap-4 md:grid-cols-3">
		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input id="title" placeholder="e.g., Böcker" {...createPage.fields.title.as('text')} />
						{#each createPage.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="name">Menu name</Label>
						<Input
							id="name"
							placeholder="Shorter name shown in menus (optional)"
							{...createPage.fields.name.as('text')}
						/>
					</div>

					<div class="space-y-2">
						<Label for="handle">Handle</Label>
						<Input
							id="handle"
							placeholder="e.g., bocker (auto-generated if empty)"
							{...createPage.fields.handle.as('text')}
						/>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Content</Card.Title>
				</Card.Header>
				<Card.Content>
					<RichTextEditor name="content" placeholder="Page content..." />
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>SEO</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="metaTitleSeo">Meta title</Label>
						<Input id="metaTitleSeo" {...createPage.fields.metaTitleSeo.as('text')} />
					</div>
					<div class="space-y-2">
						<Label for="metaDescriptionSeo">Meta description</Label>
						<Input id="metaDescriptionSeo" {...createPage.fields.metaDescriptionSeo.as('text')} />
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Parent Page</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						name="parentId"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">— None (top level) —</option>
						{#each data.parentOptions as option (option.id)}
							<option value={option.id}>{option.title}</option>
						{/each}
					</select>
					{#each createPage.fields.parentId.issues() ?? [] as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Status</Card.Title>
				</Card.Header>
				<Card.Content>
					<select
						name="status"
						value="Active"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="Active">Active</option>
						<option value="Draft">Draft</option>
						<option value="Archived">Archived</option>
					</select>
				</Card.Content>
			</Card.Root>
		</div>
	</form>
</div>
