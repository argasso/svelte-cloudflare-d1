# Product edit form — requirements & known issues

Snapshot of `/admin/products/[id]` after the refactor to a **single unified
form** covering product-level fields and every variant in one submission.

## Purpose

Admin page for editing a Shopify product (metadata, variants, and variant
metafields). Saves to local D1; separate Shopify sync via `/admin/sync`.

## Architecture (current)

### One form, one submission

- A single `<form id="product-form">` physically wraps the product cards **and**
  the variants card. Variant fields are named with JS object notation
  (`variants[i].price`, `variants[i].binding`, `variants[i].categories[]`, …) so
  SvelteKit's remote-form parser deserializes them into a `variants[]` array of
  objects. See `saveProduct` in `products.remote.ts`.
- Text fields use the field proxy (`save.fields.variants[i].price.as('text', …)`)
  for value repopulation + `issues()`. Custom controls (EnumSelect,
  MetaobjectSelect, RichTextEditor) render their own hidden inputs with the
  matching `variants[i].<name>` name.
- The header **Save Changes** button is `type="submit" form="product-form"`
  (associated, not nested) so it submits the one form. One `enhance` handler →
  one request → one `invalidateAll` → re-baseline the tracker.
- **Discard**: full page reload (`location.reload()`) — the only fully reliable
  reset given the custom controls' internal `$state`.
- Save `disabled` when `!changes.dirty || save.pending`.
- The sidebar **Status** select associates via `form="product-form"` (it can't be
  nested because the neighbouring MediaManager renders its own forms).

### Variants

- Tabs at the top of a shared Card, one per variant + a "Ny variant" tab (only
  shown when a format is still available). Panels stay mounted (visibility via
  `style:display`) so switching tabs keeps unsaved edits.
- Single Format control (`EnumSelect` over `BINDINGS`) drives `variant.title`,
  `variant.option1`, and the `book.binding` metafield in one field.
- Duplicate formats are prevented client-side (dropdown filtering) and
  server-side (in-memory duplicate check across the submitted set in `saveProduct`).
- "Default Title" edge case: variants still on Shopify's default title show the
  enum placeholder, don't count toward "used formats", and gate the Ny-variant
  panel.
- Variant image assignment is form-tracked: clicking a thumbnail updates a
  per-variant pending map and reflows a hidden `variants[i].imageId` input.
  Persisted by `saveProduct`.

### Structural mutations are commands (not the save form)

Add / delete / copy operate on the variant set itself, outside the edit-and-save
flow, so they're `command()`s invoked from buttons (no nested `<form>` inside the
product form):

- `createVariant`, `deleteVariant`, `copyVariantMetafields` in
  `products.remote.ts` are `command`s. The page calls them from event handlers,
  then `invalidateAll()` + `tick()` + `changes.markSaved()` to re-baseline the
  tracker to the fresh DOM.
- The add-variant panel's format/price controls are **nameless** (bound to local
  `$state`) so they aren't part of the tracked save.

### Shopify sync integration

- Product/variant creation, variant delete, and variant image updates go through
  the `CatalogSync` abstraction (`shopifyCatalog` when enabled, `noneCatalog`
  no-op when the sync kill switch is off).
- `variantManagedFields` includes `{price, sku, title}` in the managed-field hash
  for dirty detection.

## Dirty tracking (`src/lib/formChanges.svelte.ts`)

- One tracker for the whole page (`createFormChanges({ settleBeforeBaseline: true })`).
- Serialized-FormData diff against a baseline captured at `@attach`, then
  **re-captured once on the next animation frame** (only if still clean) so
  late-populating controls (TipTap, bits-ui selects) settle before the baseline
  is fixed — this is what makes a manual revert (Cmd-Z, reselecting the original
  option) diff back to clean. `settleBeforeBaseline` is opt-in; the single-tracker
  page enables it (authors/pages pages leave it off).
- Two listeners: document-level capture + form-level bubble.
- `markSaved()` re-baselines after a successful submit / structural change.
- Custom controls dispatch synthetic `input`/`change` events on programmatic
  value transitions so the tracker doesn't miss them (EnumSelect, MetaobjectSelect,
  RichTextEditor).

## Server (`saveProduct` in `products.remote.ts`)

- One `form()` validates `{ id, title, description, status, seo…, authors[],
  variants[] }` and writes product row + author links + every variant (row +
  metafields) + one derived-category rebuild.
- `upsertMetafield` / `applyVariantUpdate` / `toJsonList` helpers replace the
  repeated inline metafield read-then-write blocks.

## Known issues / tradeoffs to revisit

### 1. Save writes only what actually changed (resolved)

The unified form submits the whole product, but the handler bumps `updatedAt` only
where something differs:

- **Variants**: `applyVariantUpdate` diffs the row
  (price/sku/barcode/title/option1/imageId) and every metafield (`upsertMetafield`
  returns whether it changed); the row (and its `updatedAt`) is written only when
  something differs.
- **Product**: `saveProduct` diffs the editable fields (title/description/status/
  seoTitle/seoDescription, nullable text via `?? ''`) and the ordered author-link
  list; the product row is updated only when a field or the authors changed, and
  the author links are rewritten only when they changed.

So a save that touched only one variant no longer marks the product or its other
variants dirty on `/admin/sync`. The sync view groups pending changes **by
product** (one row per product, folding in its dirty variants as a sub-line) since
revert is product-scoped — see "Sync view grouping" below.

**Two normalization traps that defeated this and are now handled** (both came from
legacy data being silently re-normalized on save, which the old always-bump code
hid):

- **Metafield type drift.** Old rows stored e.g. `book.discontinued` as text
  instead of `boolean`, `book.category` as text instead of
  `list.metaobject_reference`, etc. `upsertMetafield` corrects the type, but a
  type-only correction (value unchanged) is a *local* normalization — Shopify
  already has the right type and metafields ride along with the variant push — so
  it now persists the corrected type **without** bumping the variant's watermark.
  Only a value change (or insert/delete) marks the variant dirty.
- **List ordering.** Variant categories were resolved back to gids via `inArray`
  (DB order, not selection order) and author links were loaded without
  `ORDER BY position`; either could reorder an unchanged list and read as a change.
  Both now preserve order (see the category lookup in `applyVariantUpdate` and the
  loader's `orderBy(position)`).
- **Description re-serialization.** The TipTap editor normalizes markup on load
  (Shopify's `<b>`→`<strong>`, link attributes, list rewrapping) — ~75% of imported
  descriptions don't round-trip byte-for-byte. `RichTextEditor` used to seed its
  hidden input with `serialize(editor)` on mount, so an *untouched* description
  submitted normalized HTML ≠ stored, bumping the product on every save. It now
  seeds the hidden input with the original `value` and only serializes after a real
  edit (`onUpdate`). It also remembers `normalizedOriginal` (the editor's
  serialization of the initial content) and snaps `current` back to the original
  `value` when an edit returns to that state — so bolding then un-bolding (or
  Cmd-Z) clears the dirty flag instead of leaving normalized markup that no longer
  matches the baseline.

Net: editing one variant now bumps only that variant; the first save of a
legacy-data product still normalizes types silently (no watermark bump) and only
bumps the product/variant for genuine value edits.

### 2. Cmd-Z / manual revert — should now be fixed

The previous blocker (empty product form + `form=`-associated late-mounting
fields → stale baseline, and multiple variant trackers interfering with a rAF
re-baseline) is gone: there's now one physically-wrapping form and one tracker,
and `settleBeforeBaseline` re-captures after mount. **Verify locally** that
reverting a field (and the sidebar Status, which is still `form=`-associated)
clears dirty.

### 3. Two variants have unresolved `image_id`

Unchanged from before: 2 variants have `image_shopify_id` set but no local
`media` row (images deleted in Shopify). Cosmetic (falls back to "Product
default"). Worth a one-off import cleanup that nulls dangling `image_shopify_id`s.

## Sync view grouping

Revert is **product-scoped** (`revertProductFromShopify` re-pulls the product +
all its variants + metafields and resets every watermark), so the pending-changes
list groups **by product** to avoid implying a per-variant revert that doesn't
exist:

- `listDirty` returns `DirtyEntry[]` of `kind: 'product' | 'metaobject'`. A product
  entry appears when the product row is dirty **or** any of its variants is (the
  latter is now the common case), folding the dirty variants into
  `variants[]` + a `productDirty` flag. Metaobjects stay standalone.
- **Push** on a product entry pushes the whole family: `pushSync` sends
  `productId`, and `SyncFilter.productId` (honoured by `wantsRow` in `planSync`)
  scopes the plan to that product and its variants. "Push all" is unchanged.
- **Revert** targets the product (existing behaviour). One click clears the
  product + all its variants.

**Dirty refinement (product/metaobject).** `dirtyProducts` and `dirtyMetaobjects`
now drop rows whose current managed-field hash equals the synced base
(`shopifyFieldHash`) — i.e. a value edited and then reverted to Shopify's value no
longer lingers in the list even though `updatedAt` moved. This also spares
`planSync` a no-op push. **Variants stay coarse** (updatedAt only): their base hash
covers just price/sku/title, so hashing them would wrongly hide metafield-only
edits — so a reverted *variant* field can still show until pushed.

## Files touched in this refactor

- `src/routes/admin/products/products.remote.ts` — `updateProduct` + `updateVariant`
  replaced by one `saveProduct` form; `createVariant`/`deleteVariant`/
  `copyVariantMetafields` converted to `command`; `upsertMetafield` /
  `applyVariantUpdate` / `toJsonList` helpers extracted.
- `src/routes/admin/products/[id]/+page.svelte` — single wrapping form, nested
  `variants[i].*` field names, one tracker, commands for add/delete/copy.
- `src/lib/formChanges.svelte.ts` — `settleBeforeBaseline` option (rAF re-baseline).
- `src/lib/components/EnumSelect.svelte` — `value` now `$bindable`, `name` optional
  (nameless = bound-only, nothing submitted).
- `src/lib/components/RichTextEditor.svelte` — hidden input seeded with the original
  `value`, serialized only after a real edit (no on-load re-normalization).
- `src/lib/server/sync/index.ts` — `listDirty` → product-grouped `DirtyEntry[]`;
  `SyncFilter.productId` + `wantsRow` for product-family push.
- `src/routes/admin/sync/{sync.remote.ts,+page.svelte}` — `productId` push scope;
  pending list renders product/metaobject rows with a dirty-variant sub-line.
