# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Admin + storefront for Argasso (argasso.myshopify.com), a small Swedish book publisher. Books are Shopify products with variants; pages and authors are Shopify metaobjects. All data lives in Cloudflare D1 (the source for the app); data is imported from Shopify via scripts, and propagating local edits back to Shopify is planned but **not yet implemented** (see TODOs in the product update actions; `sync_log` table exists for it).

## Commands

```sh
npm run dev                # vite dev server (uses libsql, see Database below)
npm run check              # svelte-kit sync + svelte-check — keep this at 0 errors
npm run build              # production build (Cloudflare adapter)
npm run deploy             # build + wrangler pages deploy
npm run db:generate        # drizzle-kit generate migrations from src/lib/db/schema
npm run db:migrate:local   # apply migration to local miniflare D1
npm run import:products    # Shopify -> local DB (needs SHOPIFY_ADMIN_ACCESS_TOKEN in .env)
npm run import:authors     # likewise for author metaobjects
npm run import:pages       # likewise for page metaobjects
npm run tada-generate      # regenerate gql.tada types from schema.graphql
```

There is no test suite. Verification is `npm run check` plus running the app. The `db:migrate:*` scripts hardcode the migration filename — update them when generating a new migration. `npm run import` and `register-webhooks` reference scripts that don't exist yet.

## Typing philosophy (important)

Types are **inferred, never hand-authored**: from the Drizzle schema (`$inferSelect`/`$inferInsert`, `drizzle-valibot` for validation schemas) and from the Shopify GraphQL schema via gql.tada (`$lib/graphql.ts` + `schema.graphql`). The single deliberate exception is `FieldsByType` in `src/lib/db/schema/metaobject.ts`, because a JSON column's shape can't be inferred — when a metaobject type or field is added in Shopify, update that map and everything downstream type-checks from it.

## Architecture

- **Database selection happens in `src/hooks.server.ts`**: on Cloudflare, the D1 binding (`platform.env.DB`); locally, libsql via `DATABASE_URL`. Both are exposed as `locals.db` typed as `DbClient` (`src/lib/server/db/index.ts`). `DATABASE_URL` in `.env` points directly at the **miniflare D1 sqlite file under `.wrangler/state/`** — local dev, drizzle-kit, and `wrangler d1 --local` all share that one database. `local.db` in the root is an empty stray; don't use it.

- **Schema** (`src/lib/db/schema/`): `product` ⟷ `variant` ⟷ `metafield` (Shopify metafields, namespaced e.g. `book.binding`, `translated_book.original_title`, owned by variants/products via `ownerId`/`ownerType`), `metaobject` (pages + authors in one table, discriminated by `type`, hierarchical via `parentId`), `productsToMetaobjects` (join with `relationType` 'category' | 'author'), `media`, `syncLog`.

- **Metaobject narrowing**: the `fields` JSON column is typed as a union; the `type` column is the discriminant. Use `isAuthor`/`isPage`/`isMetaobjectOf` from the schema to narrow a row to `MetaobjectOf<'author' | 'page'>` with correctly typed fields. Don't cast `fields`.

- **Rich text**: author `description` and page `content` hold Shopify rich-text **JSON strings**. Converters live in `src/lib/utils/richtext.ts`. When editing rich text as plain text in admin forms, save through `updateRichText(existing, text)` — it keeps the original JSON (and its formatting) when the text is unchanged and only re-encodes on real edits.

- **Routes**: `(storefront)` group is the public Swedish-language site; `/admin` is the management UI (auth is a placeholder in `hooks.server.ts` — Cloudflare Access JWT planned, local dev bypasses). Sidebar links to `/admin/pages`, `/admin/sync`, `/admin/settings` are **not yet built**. `experimental.remoteFunctions` is enabled in `svelte.config.js` and `src/routes/admin/authors/authors.remote.ts` is an empty placeholder — the authors CRUD was going to migrate from form actions to remote functions; that decision is unresolved.

- **Import scripts** (`scripts/import/`) run with tsx directly against the local DB (not through SvelteKit), querying the Shopify Admin API with the typed client in `src/lib/shopify/admin-client.ts`. Metaobject upserts there use raw SQL keyed on `shopify_id`.

- **UI**: vendored shadcn-svelte components in `src/lib/components/ui/` (Svelte 5 runes, Tailwind 4, bits-ui). The shared type helpers they import (`WithElementRef` etc.) live in `$lib/utils.ts`.

## Environment

Secrets in `.env` (see `.env.example`): `SHOPIFY_ADMIN_ACCESS_TOKEN` for imports, `DATABASE_URL`/`LOCAL_DB_PATH` for local DB. `wrangler.jsonc` defines production (`argasso-production`) and preview D1 databases plus an R2 `MEDIA` bucket (unused so far).
