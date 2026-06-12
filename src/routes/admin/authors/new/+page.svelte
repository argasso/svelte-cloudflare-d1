<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/authors">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold">New Author</h1>
			<p class="text-muted-foreground">Add a new author to the catalog</p>
		</div>
		<Button type="submit" form="author-form">
			<Plus class="mr-2 h-4 w-4" />
			Create Author
		</Button>
	</div>

	<form id="author-form" method="POST" action="?/create" class="grid gap-4 md:grid-cols-3">
		<div class="md:col-span-2 space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Basic Information</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="title">Name *</Label>
						<Input id="title" name="title" placeholder="e.g., John Doe" required />
					</div>

					<div class="space-y-2">
						<Label for="handle">Handle</Label>
						<Input
							id="handle"
							name="handle"
							placeholder="e.g., john-doe (auto-generated if empty)"
						/>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="firstName">First Name</Label>
							<Input
								id="firstName"
								name="firstName"
								placeholder="e.g., John"
							/>
						</div>

						<div class="space-y-2">
							<Label for="lastName">Last Name</Label>
							<Input
								id="lastName"
								name="lastName"
								placeholder="e.g., Doe"
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="author@example.com"
						/>
					</div>

					<div class="space-y-2">
						<Label for="website">Website</Label>
						<Input
							id="website"
							name="website"
							type="url"
							placeholder="https://example.com"
						/>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Bio</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="space-y-2">
						<textarea
							id="bio"
							name="bio"
							rows={8}
							class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							placeholder="Write the author's biography here..."
						></textarea>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="space-y-4">
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
