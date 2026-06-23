<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { searchAuthors } from '../../routes/admin/products/products.remote';

	type Author = { id: number; title: string | null };

	interface Props {
		/** Form field name (submitted as e.g. `authors[]`). */
		name: string;
		/** Associate the hidden inputs with a form by id. */
		form?: string;
		/** Currently linked authors. */
		initial?: Author[];
	}

	let { name, form, initial = [] }: Props = $props();

	let selected = $state<Author[]>([...initial]);
	let open = $state(false);
	let term = $state('');
	let results = $state<Author[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const selectedIds = $derived(new Set(selected.map((a) => a.id)));
	// Selected first (so they're easy to untick), then matching results.
	const items = $derived([...selected, ...results.filter((a) => !selectedIds.has(a.id))]);

	async function runSearch() {
		results = await searchAuthors(term);
	}

	function onInput(value: string) {
		term = value;
		clearTimeout(timer);
		timer = setTimeout(runSearch, 200); // debounce
	}

	function toggle(a: Author) {
		selected = selectedIds.has(a.id)
			? selected.filter((x) => x.id !== a.id)
			: [...selected, a];
	}
</script>

<!-- Hidden inputs carry the selection into the product form -->
{#each selected as a (a.id)}
	<input type="hidden" {name} {form} value={String(a.id)} />
{/each}

<Popover.Root bind:open onOpenChange={(o) => o && results.length === 0 && runSearch()}>
	<Popover.Trigger
		class="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm"
	>
		{#if selected.length === 0}
			<span class="text-muted-foreground">Välj författare…</span>
		{:else}
			{#each selected as a (a.id)}
				<span class="rounded bg-secondary px-2 py-0.5 text-sm">{a.title}</span>
			{/each}
		{/if}
		<ChevronsUpDown class="ml-auto h-4 w-4 shrink-0 opacity-50" />
	</Popover.Trigger>
	<Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input placeholder="Sök författare…" oninput={(e) => onInput(e.currentTarget.value)} />
			<Command.List>
				<Command.Empty>Inga författare hittades.</Command.Empty>
				{#each items as a (a.id)}
					<Command.Item value={String(a.id)} onSelect={() => toggle(a)}>
						<Check class={selectedIds.has(a.id) ? 'opacity-100' : 'opacity-0'} />
						{a.title}
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
