<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { Command as CommandPrimitive } from 'bits-ui';
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
	let term = $state('');
	let results = $state<Author[]>([]);
	let open = $state(false);
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

	function onFocus() {
		open = true;
		if (results.length === 0) runSearch();
	}

	// Close only when focus leaves the whole component (Tab away / click outside).
	function onFocusOut(e: FocusEvent & { currentTarget: HTMLElement }) {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) open = false;
	}
</script>

<!-- Hidden inputs carry the selection into the product form -->
{#each selected as a (a.id)}
	<input type="hidden" {name} {form} value={String(a.id)} />
{/each}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" onfocusout={onFocusOut}>
	<Command.Root shouldFilter={false} class="overflow-visible bg-transparent">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={(e) => e.currentTarget.querySelector('input')?.focus()}
			class="focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 outline-none focus-within:ring-[3px]"
		>
			{#each selected as a (a.id)}
				<span class="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm">
					{a.title}
					<button
						type="button"
						onclick={() => toggle(a)}
						class="text-muted-foreground hover:text-foreground"
						aria-label="Ta bort"
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
			<CommandPrimitive.Input
				bind:value={term}
				oninput={(e) => onInput(e.currentTarget.value)}
				onfocus={onFocus}
				placeholder={selected.length === 0 ? 'Sök författare…' : ''}
				class="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
			/>
		</div>

		{#if open}
			<div class="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
				<Command.List>
					<Command.Empty>Inga författare hittades.</Command.Empty>
					{#each items as a (a.id)}
						<Command.Item value={String(a.id)} onSelect={() => toggle(a)}>
							<Check class={selectedIds.has(a.id) ? 'opacity-100' : 'opacity-0'} />
							{a.title}
						</Command.Item>
					{/each}
				</Command.List>
			</div>
		{/if}
	</Command.Root>
</div>
