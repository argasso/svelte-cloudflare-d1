<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	// shadcn Select wrapper for fixed-choice metafields. Renders a hidden input
	// (bits-ui `name`) so it submits with the surrounding remote form.
	interface Props {
		/** Field name for the submitted hidden input. Omit to use it purely as a
		 * bound control (no hidden input, nothing submitted). */
		name?: string;
		options: string[];
		initial?: string;
		/** Two-way bindable selection. Defaults to `initial` for uncontrolled use. */
		value?: string;
		placeholder?: string;
		id?: string;
	}

	let { name, options, initial = '', value = $bindable(initial), placeholder = 'Välj…', id }: Props =
		$props();

	// bits-ui writes the selected value to its hidden input programmatically —
	// a native `change` event isn't fired. Anything relying on input/change
	// bubbling (form-dirty tracker, generic form observers) would miss the
	// update. Dispatch one ourselves on value transitions (after mount).
	let host = $state<HTMLDivElement>();
	let previous = initial;
	$effect(() => {
		if (value === previous) return;
		previous = value;
		if (!name) return; // no hidden input to notify (bound-only usage)
		queueMicrotask(() => {
			host?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
				?.dispatchEvent(new Event('change', { bubbles: true }));
		});
	});
</script>

<div bind:this={host} class="contents">
<Select.Root type="single" {name} bind:value>
	<!-- bits-ui handles arrow keys on the trigger, so it must keep focus. On macOS
	     a button isn't focused on click, and bits-ui's pointerup preventDefault
	     suppresses the click event — so focus the trigger on pointerup (after the
	     open) to keep arrow-key navigation working after a mouse open. -->
	<Select.Trigger
		{id}
		class="data-[state=open]:border-ring data-[state=open]:ring-ring/50 w-full data-[state=open]:ring-[3px]"
		onpointerup={(e) => {
			const t = e.currentTarget;
			queueMicrotask(() => t.focus());
		}}
	>
		{value || placeholder}
	</Select.Trigger>
	<Select.Content>
		{#each options as opt (opt)}
			<Select.Item value={opt} label={opt} />
		{/each}
	</Select.Content>
</Select.Root>
</div>
