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
	<Select.Trigger {id} class="w-full">{value || placeholder}</Select.Trigger>
	<Select.Content>
		{#each options as opt (opt)}
			<Select.Item value={opt} label={opt} />
		{/each}
	</Select.Content>
</Select.Root>
