<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	// shadcn Select wrapper for fixed-choice metafields. Renders a hidden input
	// (bits-ui `name`) so it submits with the surrounding remote form.
	interface Props {
		name: string;
		options: string[];
		initial?: string;
		placeholder?: string;
		id?: string;
	}

	let { name, options, initial = '', placeholder = 'Välj…', id }: Props = $props();
	let value = $state(initial);
</script>

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
