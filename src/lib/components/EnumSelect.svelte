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
	<!-- Focus the trigger on click: macOS Firefox/Safari don't focus buttons on
	     click, which otherwise leaves arrow-key navigation dead until you Tab. -->
	<Select.Trigger
		{id}
		class="data-[state=open]:border-ring data-[state=open]:ring-ring/50 w-full data-[state=open]:ring-[3px]"
		onclick={(e) => e.currentTarget.focus()}
	>
		{value || placeholder}
	</Select.Trigger>
	<Select.Content>
		{#each options as opt (opt)}
			<Select.Item value={opt} label={opt} />
		{/each}
	</Select.Content>
</Select.Root>
