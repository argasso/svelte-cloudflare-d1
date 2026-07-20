# Product edit form — requirements & known issues

Snapshot of the state of `/admin/products/[id]` after the session that unified Save/Discard, folded variants into tabs, and moved variant image assignment into the form-tracked save flow.

## Purpose

Admin page for editing a Shopify product (metadata, variants, and variant metafields). Saves to local D1; separate Shopify sync via `/admin/sync`.

## UX requirements (implemented)

### Layout & save flow

- Sticky header at the top with product title, back button, single **Save Changes**, and **Discard** (only shown when dirty). Both buttons stay visible while scrolling.
- One unified Save Changes: submits the product form + every dirty variant form via `requestSubmit()`. No per-variant Save buttons.
- Discard: full page reload (`location.reload()`). Resets product form, all variant forms, and pending variant image selections.
- Save button `disabled` when `!anyDirty || anyPending`, where `anyDirty = productChanges.dirty || anyVariantDirty`.

### Variants

- Tabs at the top of a shared Card, one per variant + a "Ny variant" tab (only shown when a format is still available).
- Active tab's header carries per-variant actions: **Copy from…** (dropdown copying book metafields, excludes `binding`/`category`/`discontinued`) and **Delete** (only when >1 variant).
- Single Format control (`EnumSelect` over `BINDINGS`) drives all three of `variant.title`, `variant.option1`, and the `book.binding` metafield in one field.
- Prevent adding a variant with a format that's already used (client-side filter of available options + server-side 409 check on `updateVariant` / `createVariant`).
- "Default Title" edge case: variants still on Shopify's default title show the enum placeholder, don't count toward "used formats", and gate the Ny-variant panel with "Välj format…".
- Variant image assignment is form-tracked: clicking a thumbnail updates a per-variant pending map, moves the ring highlight immediately, and reflows a hidden `imageId` input in the variant form. Persists on Save via `updateVariant`, not via a separate `setVariantImage` command.

### Shopify sync integration

- Product/variant creation, variant delete, and variant image updates all go through the `CatalogSync` abstraction (`shopifyCatalog` when enabled, `noneCatalog` no-op when the sync kill switch is off in settings).
- `updateVariant` on Shopify sends `optionValues: [{ optionName, name: title }]` when title changes, so Shopify variant title stays aligned with local title. Skipped when title unchanged to avoid an extra round-trip.
- `variantManagedFields` includes `{price, sku, title}` in the managed-field hash for dirty detection.

## Dirty tracking (`src/lib/formChanges.svelte.ts`)

- Serialized-FormData diff against a baseline captured synchronously at `@attach`.
- Two listeners: document-level capture (catches events from controls form-associated via the `form=` attribute) + form-level bubble (belt-and-suspenders for controls that ARE descendants — variant forms).
- `markSaved()` re-baselines after a successful submit.
- Custom components dispatch synthetic `input` events on programmatic value transitions (`bubbles: true`), so the tracker doesn't miss them:
  - `EnumSelect` (bits-ui writes hidden input via effect, no native event).
  - `MetaobjectSelect` (adding/removing an item is a `$state` mutation, no event).
  - `RichTextEditor` (TipTap `onUpdate` writes `current`, hidden input reflows programmatically).
- Consumers use `{@attach changes.attach}` (Svelte 5 attachment) — old pages migrated from `use:changes.attach`.

## Known issues to address later

### 1. Cmd-Z / manual revert on product-form fields doesn't reset dirty

Product `<form id="product-form">` is empty; all fields (title, description, seoTitle, seoDescription, authors, status) live in sibling Cards associated via `form="product-form"`. At sync-attach time these siblings haven't mounted yet, so baseline is missing them. When the user reverts a field, `serialize(form)` still contains those fields → doesn't match baseline → dirty stuck at true.

Attempted fix: a `requestAnimationFrame` re-baseline pass gated on `!dirty`. It fixed Cmd-Z but consistently broke variant tracking for reasons I could not pin down even when the rAF was scoped to only the product tracker via `opts.deferredBaseline`. Reverted. Workaround for users: click Discard to reload.

Likely proper fix: restructure the DOM so the product form actually wraps its fields. Blocker: the Variants Card contains nested variant `<form>` elements, so the product form can't just wrap the Card grid without producing invalid nested forms. Would need to split the Variants Card out of the product form's wrapper, or portal variant forms elsewhere.

### 2. Two variants have unresolved `image_id`

Out of 100 variants with `image_shopify_id` set (backfilled during this session), 2 remain with `NULL` `image_id` because their linked media rows don't exist in `media` locally — likely images that were deleted in Shopify but the variant record still references the old MediaImage gid. Cosmetic (falls back to "Product default"). Worth a one-off cleanup pass that nulls dangling `image_shopify_id`s during import.

### 3. Uncontrolled text inputs from Kit remote form

`variantForm.fields.<X>.as('text', ...)` returns no `oninput` for text inputs — the value is uncontrolled. Not a bug for us (Kit's form-level `handle_input` catches it), but worth noting when reasoning about which events fire when.

### 4. Pre-existing `state_referenced_locally` warnings

In `EnumSelect`, `MetaobjectSelect`, `PriceRange`, and this page's `activeTab` initializer. Not blocking; the `data.product.variants[0]?.id` for `activeTab` intentionally captures initial only.

## Files touched in this session

- `src/lib/formChanges.svelte.ts` — sync-baseline dirty tracker, doc + form listeners.
- `src/lib/components/EnumSelect.svelte`, `MetaobjectSelect.svelte`, `RichTextEditor.svelte` — synthetic input dispatch on programmatic changes.
- `src/routes/admin/products/[id]/+page.svelte` — sticky header, unified save, variant tabs, format merge, variant image as form field, `saveAll`.
- `src/routes/admin/products/products.remote.ts` — `updateVariant` accepts `imageId`; `createVariant`, `deleteVariant`, `copyVariantMetafields`; `createProduct`.
- `src/lib/server/sync/gateway.ts`, `fields.ts`, `index.ts`, `revert.ts`, `webhook.ts` — variant title in managed-fields; `optionValues` on push; product/variant create + delete gateway methods.
- `src/lib/server/commerce/{types,shopify,none}.ts` — `CatalogSync` extended with create/delete methods.
- `scripts/import/products.ts` — rewritten to delegate to the shared `importProductPage` (was a drifted duplicate that skipped variant media and never resolved `image_id`).
- `src/routes/admin/products/new/+page.svelte` — minimal create form.
- `src/routes/admin/authors/[id]/+page.svelte`, `src/routes/admin/pages/[id]/+page.svelte` — switched from `use:changes.attach` to `{@attach changes.attach}` for Svelte 5 compatibility with the new tracker return shape.
