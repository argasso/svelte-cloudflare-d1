<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
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
	let hi = $state(0); // highlighted index
	let timer: ReturnType<typeof setTimeout> | undefined;

	const selectedIds = $derived(new Set(selected.map((a) => a.id)));
	// Selected first (easy to untick), then matching results.
	const items = $derived([...selected, ...results.filter((a) => !selectedIds.has(a.id))]);

	async function runSearch() {
		results = await searchAuthors(term);
		hi = 0;
	}

	function onInput(value: string) {
		term = value;
		open = true;
		clearTimeout(timer);
		timer = setTimeout(runSearch, 200); // debounce
	}

	function onFocus() {
		open = true;
		if (results.length === 0) runSearch();
	}

	function toggle(a: Author) {
		selected = selectedIds.has(a.id)
			? selected.filter((x) => x.id !== a.id)
			: [...selected, a];
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			open = true;
			hi = Math.min(hi + 1, items.length - 1);
			e.preventDefault();
		} else if (e.key === 'ArrowUp') {
			hi = Math.max(hi - 1, 0);
			e.preventDefault();
		} else if (e.key === 'Enter') {
			if (open && items[hi]) {
				toggle(items[hi]);
				e.preventDefault();
			}
		} else if (e.key === 'Escape') {
			if (open) {
				open = false;
				e.preventDefault();
			}
		}
		// Tab is left alone so focus moves to the next field (and closes via blur).
	}

	// Close and reset the search when focus leaves the whole component, so a
	// later reopen starts fresh instead of showing the previous query.
	function onFocusOut(e: FocusEvent & { currentTarget: HTMLElement }) {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
			open = false;
			term = '';
			results = [];
			hi = 0;
		}
	}
</script>

<!-- Hidden inputs carry the selection into the product form -->
{#each selected as a (a.id)}
	<input type="hidden" {name} {form} value={String(a.id)} />
{/each}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" onfocusout={onFocusOut}>
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
		<input
			bind:value={term}
			oninput={(e) => onInput(e.currentTarget.value)}
			onfocus={onFocus}
			onkeydown={onKeydown}
			role="combobox"
			aria-expanded={open}
			aria-controls="author-listbox"
			placeholder={selected.length === 0 ? 'Sök författare…' : ''}
			class="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
		/>
	</div>

	{#if open}
		<ul
			id="author-listbox"
			role="listbox"
			tabindex="-1"
			class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if items.length === 0}
				<li class="px-3 py-2 text-sm text-muted-foreground">Inga författare hittades.</li>
			{:else}
				{#each items as a, i (a.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						role="option"
						aria-selected={selectedIds.has(a.id)}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => toggle(a)}
						onmousemove={() => (hi = i)}
						class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm {i === hi
							? 'bg-accent text-accent-foreground'
							: ''}"
					>
						<Check class="h-4 w-4 {selectedIds.has(a.id) ? 'opacity-100' : 'opacity-0'}" />
						{a.title}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>
