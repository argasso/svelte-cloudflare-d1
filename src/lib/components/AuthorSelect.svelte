<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { searchAuthors } from '../../routes/admin/products/products.remote';

	type Author = { id: number; title: string | null };

	interface Props {
		/** Form field name (submitted as `${name}[]`). */
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
	const visible = $derived(results.filter((a) => !selectedIds.has(a.id)));

	async function runSearch() {
		results = await searchAuthors(term);
	}

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(runSearch, 200); // debounce
	}

	function add(a: Author) {
		if (!selectedIds.has(a.id)) selected = [...selected, a];
		term = '';
		results = [];
	}

	function remove(id: number) {
		selected = selected.filter((a) => a.id !== id);
	}
</script>

<!-- Hidden inputs carry the selection into the product form -->
{#each selected as a (a.id)}
	<input type="hidden" {name} {form} value={String(a.id)} />
{/each}

<div class="relative">
	<div class="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5">
		{#each selected as a (a.id)}
			<span class="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm">
				{a.title}
				<button
					type="button"
					onclick={() => remove(a.id)}
					class="text-muted-foreground hover:text-foreground"
					aria-label="Ta bort"
				>
					<X class="h-3 w-3" />
				</button>
			</span>
		{/each}
		<input
			bind:value={term}
			oninput={onInput}
			onfocus={() => {
				open = true;
				if (results.length === 0) runSearch();
			}}
			onblur={() => setTimeout(() => (open = false), 150)}
			placeholder={selected.length === 0 ? 'Sök författare…' : ''}
			class="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
		/>
	</div>

	{#if open && visible.length > 0}
		<ul
			class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background p-1 shadow-lg"
		>
			{#each visible as a (a.id)}
				<li>
					<button
						type="button"
						onmousedown={(e) => {
							e.preventDefault();
							add(a);
						}}
						class="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent"
					>
						{a.title}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
