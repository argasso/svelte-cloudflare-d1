<script lang="ts">
    import * as Select from "$lib/components/ui/select";
	import { Input } from '$lib/components/ui/input';
	import { category, productInsertSchema, productsToCategoriesInsertSchema } from '$lib/db/schema';
	import { type SuperValidated, type Infer, superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import type { InferSelectModel } from 'drizzle-orm';
	import Pill from '../Pill.svelte';
    import ShadEditor from '$lib/components/shad-editor/shad-editor.svelte';
	// import * as Field from "$lib/components/ui/field";
	import { Field, Control, Label, Description, FieldErrors, Fieldset, Legend } from "formsnap";
	
import SuperDebug from "sveltekit-superforms";
	import { Button } from '../ui/button';

	interface Props {
		form: SuperValidated<Infer<typeof productInsertSchema>>;
		meta: {
			categories: Array<InferSelectModel<typeof category>>
		}
	}

    let { form: initialForm, meta }: Props = $props();

    const validators = zodClient(productInsertSchema)
	const form = superForm(initialForm, {
        validators,
        resetForm: false,
		dataType: 'json',
		onSubmit: a => console.log(a),
		
    });
	const { form: data, message, enhance } = form;

	// console.log('message' , message);
	
	$inspect(message)
</script>

{#if $message}<h3>{$message}</h3>{/if}
<form method="POST" use:enhance>
	{#if $data.id}
		<input type="hidden" name="id" bind:value={$data.id} />
	{/if} 
	<Field {form} name="title">
		<Control>
			{#snippet children({ props })}
				<Label>Titel</Label>
				<Input {...props}  bind:value={$data.title} />
			{/snippet}
		</Control>
		<FieldErrors class="text-destructive" />
	</Field>

	<Field {form} name="description">
		<Control>
			{#snippet children({ props })}
				<Label>Description</Label>
				<ShadEditor class="h-[40rem]" bind:content={$data.description} />
			{/snippet}
		</Control>
		<FieldErrors />
	</Field>

    <Field {form} name="shopifyId">
		<Control>
			{#snippet children({ props })}
				<Label>Shopify ID</Label>
				<Input {...props} bind:value={$data.shopifyId} readonly/>
			{/snippet}
		</Control>
		<FieldErrors />
	</Field>
	<Field {form} name="stripeId">
		<Control>
			{#snippet children({ props })}
				<Label>Stripe ID</Label>
				<Input {...props} bind:value={$data.stripeId} readonly/>
			{/snippet}
		</Control>
		<FieldErrors />
	</Field>

    <Field {form} name="categories">
        <Control>
          {#snippet children({ props })}
            <Label>Categories</Label>
            <Select.Root
              type="multiple"
              bind:value={$data.categories}
            >
              <Select.Trigger {...props} class="flex">
				{#if $data.categories && $data.categories.length > 0 }
					<div class="flex">
						{#each $data.categories.map(id => meta.categories.find(c => c.id == parseInt(id))) as category }
							<Pill name={category?.name ?? 'undef'} href=""></Pill>
						{/each}
					</div>
				{:else}
					Select a verified email to display
				{/if}
				
              </Select.Trigger>
              <Select.Content>
				{#each meta.categories as category}
                	<Select.Item value={String(category.id)} label={category.name} />
				{/each}
              </Select.Content>
            </Select.Root>
          {/snippet}
        </Control>
        <FieldErrors />
      </Field>      
    <Button type="submit">Submit</Button>
</form>
<SuperDebug data={$data} />
