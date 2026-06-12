<script lang="ts">
	import { ListOrdered } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import type { ToolBarIconProps } from './types.js';

	let { editor, toolTipProps = { delayDuration: 0, disabled: false } }: ToolBarIconProps = $props();
</script>

<Tooltip.Provider {...toolTipProps}>
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant="ghost"
				class={cn('size-8', editor.isActive('orderedList') && 'bg-muted')}
				onclick={() => editor.chain().focus().toggleOrderedList().run()}
			>
				<ListOrdered />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>Ordered List</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
