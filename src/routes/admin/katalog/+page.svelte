<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import Download from '@lucide/svelte/icons/download';
	import Trash from '@lucide/svelte/icons/trash';
	import Upload from '@lucide/svelte/icons/upload';
	import Check from '@lucide/svelte/icons/check';
	import { invalidateAll } from '$app/navigation';
	import { removeCatalogue, setRequestStatus, uploadCatalogue } from './katalog.remote';

	let { data } = $props();

	const kb = $derived(data.catalogue ? Math.round(data.catalogue.sizeBytes / 1024) : 0);
	const size = $derived(kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' kB');

	const statusLabel: Record<string, string> = {
		pending: 'Väntar',
		sent: 'Skickad',
		cancelled: 'Avbruten'
	};
	const statusClass: Record<string, string> = {
		pending: 'bg-amber-100 text-amber-800',
		sent: 'bg-green-100 text-green-800',
		cancelled: 'bg-gray-100 text-gray-800'
	};

	const upload = uploadCatalogue.for('upload');
	const remove = removeCatalogue.for('remove');
	const pendingCount = $derived(data.requests.filter((r) => r.status === 'pending').length);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-3xl font-bold">Katalog</h1>
		<p class="text-muted-foreground">Ladda upp katalogen och hantera beställningar av tryckt katalog.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Aktuell katalog (PDF)</Card.Title>
			<Card.Description>Visas på /var-katalog för nedladdning.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.catalogue}
				<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
					<div>
						<p class="font-medium">{data.catalogue.filename}</p>
						<p class="text-sm text-muted-foreground">
							{size} • laddades upp {new Date(data.catalogue.uploadedAt).toLocaleString('sv-SE')}
						</p>
					</div>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							href="/media/{data.catalogue.r2Key}"
							download={data.catalogue.filename}
						>
							<Download class="mr-2 h-4 w-4" />
							Öppna
						</Button>
						<form
							{...remove.enhance(async ({ submit }) => {
								if (confirm('Ta bort den aktuella katalogen?')) {
									await submit();
									await invalidateAll();
								}
							})}
						>
							<Button type="submit" variant="destructive" size="sm" disabled={!!remove.pending}>
								<Trash class="mr-2 h-4 w-4" />
								Ta bort
							</Button>
						</form>
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Ingen katalog uppladdad än.</p>
			{/if}

			<form
				{...upload.enhance(async ({ submit }) => {
					if (await submit()) await invalidateAll();
				})}
				class="flex flex-wrap items-end gap-3"
			>
				<div class="flex-1 space-y-1.5">
					<label for="katalog-file" class="text-sm font-medium">Ladda upp ny katalog (PDF, max 50 MB)</label>
					<input
						id="katalog-file"
						type="file"
						name="file"
						accept="application/pdf"
						required
						class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
					/>
				</div>
				<Button type="submit" disabled={!!upload.pending}>
					<Upload class="mr-2 h-4 w-4" />
					{upload.pending ? 'Laddar upp…' : 'Ladda upp'}
				</Button>
			</form>
			{#each upload.fields.file.issues() ?? [] as issue (issue.message)}
				<p class="text-sm text-destructive">{issue.message}</p>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>
				Beställningar av tryckt katalog ({data.requests.length})
				{#if pendingCount > 0}
					<span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
						{pendingCount} väntar
					</span>
				{/if}
			</Card.Title>
			<Card.Description>Beställningar från formuläret på /var-katalog.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.requests.length === 0}
				<p class="text-sm text-muted-foreground">Inga beställningar än.</p>
			{:else}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Mottagen</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Namn</Table.Head>
								<Table.Head>Adress</Table.Head>
								<Table.Head>Kontakt</Table.Head>
								<Table.Head class="w-[180px]">Åtgärd</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.requests as req (req.id)}
								{@const mark = setRequestStatus.for(`${req.id}`)}
								<Table.Row>
									<Table.Cell class="whitespace-nowrap text-sm text-muted-foreground">
										{new Date(req.createdAt).toLocaleString('sv-SE')}
									</Table.Cell>
									<Table.Cell>
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[
												req.status
											]}"
										>
											{statusLabel[req.status]}
										</span>
										{#if req.sentAt}
											<div class="text-xs text-muted-foreground">
												{new Date(req.sentAt).toLocaleDateString('sv-SE')}
											</div>
										{/if}
									</Table.Cell>
									<Table.Cell class="font-medium">{req.name}</Table.Cell>
									<Table.Cell class="text-sm">
										{req.addressLine1}{#if req.addressLine2}<br />{req.addressLine2}{/if}<br />
										{req.postalCode}
										{req.city}
									</Table.Cell>
									<Table.Cell class="text-sm">
										<a href="mailto:{req.email}" class="hover:underline">{req.email}</a>
										{#if req.phone}<br /><span class="text-muted-foreground">{req.phone}</span>{/if}
										{#if req.note}<div class="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{req.note}</div>{/if}
									</Table.Cell>
									<Table.Cell>
										<form
											{...mark.enhance(async ({ submit }) => {
												await submit();
												await invalidateAll();
											})}
											class="flex flex-wrap gap-1"
										>
											<input type="hidden" name="id" value={req.id} />
											{#if req.status !== 'sent'}
												<Button type="submit" name="status" value="sent" size="sm" variant="outline">
													<Check class="mr-1 h-3.5 w-3.5" />
													Skickad
												</Button>
											{/if}
											{#if req.status !== 'cancelled'}
												<Button type="submit" name="status" value="cancelled" size="sm" variant="ghost">
													Avbryt
												</Button>
											{/if}
										</form>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
