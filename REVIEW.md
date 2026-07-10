# Project Review — svelte-cloudflare-d1 (Argasso storefront)

**Date:** 2026-07-07 · **Reviewed at:** commit `7c1a870` · **Reviewer:** Claude (automated code review)

## Scope and goals reviewed against

The project rewrites the Argasso bokförlag storefront (previously SvelteKit + Shopify Storefront API) so that:

1. The app **owns its data** — imported from Shopify into Cloudflare D1.
2. Local edits can be **synced back** to Shopify.
3. An **admin UI** lets staff view and edit all relevant store data.

Review dimensions: goal completion, usability, design, **security**, and maintainability. Verification performed: full source read-through, `npm run check` (0 errors, 7 warnings), `npm run lint` (fails — see M2).

---

## Summary

This is a well-architected project that is much further along than its own documentation admits. The data model is clean, the typing discipline (everything inferred from Drizzle + gql.tada, no hand-authored duplicates) is genuinely excellent, and the D1⟷Shopify sync engine is thoughtfully designed: dirty detection via timestamps, optimistic concurrency against Shopify's `updatedAt`, field-hash refinement to eliminate false conflicts, dry-run by default, conflicts never overwrite, and every outcome audited in `sync_log`. Inbound webhooks verify HMAC in constant time and refuse to clobber rows with unpushed local edits. Commerce (Stripe checkout, orders, refunds, EU withdrawal flow, gapless Swedish receipt numbering) is a substantial bonus beyond the stated goals.

**However, there is one critical security hole that must be fixed before anything else** (S1 below): several admin mutation endpoints are reachable without authentication in production. Because unsanitized admin HTML is rendered on the public storefront, this chains into stored XSS. It is a small fix.

The other main gaps are the total absence of tests and CI for logic this subtle (sync/conflict resolution begs for unit tests), and documentation drift that will actively mislead the agents this repo is written for.

### Goal completion scorecard

| Goal | Status |
|---|---|
| Own the data in D1 | ✅ Done. D1 is the source of truth; schema covers products, variants, metafields, metaobjects (pages/authors), links, media, orders, settings, sync log. |
| Import from Shopify | ✅ Done, twice: CLI scripts (`scripts/import/`) and a browser-driven stepped import (`/admin/sync`, bounded per request for Workers limits). |
| Sync back to Shopify | ✅ Largely done — metaobjects, products, variants, metafields, links, and media all push via the typed gateway. Inbound webhooks keep the base fresh. Remaining: rebase after import is manual; entity create/delete propagation is partial. |
| Admin UI | ✅ Broad coverage: products/variants (incl. book metafields, categories, authors), pages (hierarchy), authors, media (R2), orders (status/refund/receipt), sync dashboard, settings. Form-change tracking with gated Save/Discard is a nice touch. |

---

## Findings

### Security

**S1 — CRITICAL: Unauthenticated admin mutations via remote functions.**
The `/admin` path guard in `hooks.server.ts` does not protect SvelteKit remote functions, which are served from `/_app/remote/...`. The code knows this — most remote modules self-guard with `requireAdmin()` — but three do not:

- `src/routes/admin/authors/authors.remote.ts` — `createAuthor`, `updateAuthor`, `deleteAuthor`: **no guard**
- `src/routes/admin/pages/pages.remote.ts` — `createPage`, `updatePage`, `deletePage`: **no guard**
- `src/routes/admin/products/products.remote.ts` — `updateProduct`, `updateVariant`: **no guard** (only the two search queries in this file are guarded)

In production, any anonymous visitor can create/edit/delete authors and pages and edit any product/variant (titles, prices, descriptions, category/author links). If the Cloudflare Access application only covers `/admin/*` paths (the config implies path-based protection), Access does not save you here.

**S2 — HIGH: Stored XSS on the public storefront (chains from S1).**
`htmlField` deliberately does not sanitize (documented as "trusted admin input"), and product descriptions are rendered with `{@html}` on the home page and book pages; author bios and page content render via the rich-text converters. With S1 open, "trusted admin input" is attacker input: writing `<script>…</script>` into a product description via the unguarded `updateProduct` yields stored XSS for every storefront visitor. Even after S1 is fixed, sanitizing at the render boundary is cheap defense in depth.

**S3 — What is already good (keep it that way).**
Cloudflare Access JWT verification with `jose` against the team JWKS, fail-closed with a login redirect; `requireAdmin` returning 401 vs 403 deliberately; Shopify webhook HMAC verified constant-time over the raw body; Stripe webhook signature verified via `constructEventAsync`; public order pages gated by an unguessable `crypto.randomUUID()` access token with uniform 404s; cart cookie is httpOnly and stores only variant refs + qty (prices resolved server-side, so tampering is harmless); JSON-LD output escapes `<` to prevent script-tag breakout; `/media` serves only by exact R2 key with immutable caching. This is a strong baseline.

**S4 — MEDIUM: Secret handling.**
`SHOPIFY_ADMIN_ACCESS_TOKEN` currently lives only in `.env` (noted in CLAUDE.md); production webhooks and sync read it from `env`, so it must be a Wrangler secret before commerce/sync go live. `.gitignore` correctly excludes `.env`; nothing secret is committed (D1 database IDs and org/VAT numbers in `wrangler.jsonc` are not secrets).

### Maintainability

**M1 — No tests.** `npm run check` is the only automated verification. The riskiest logic in the repo is pure and trivially testable: `sync/conflict.ts` (decideSync state machine, timestamp normalization), `sync/fields.ts` (managed-field hashing — a hash mismatch bug silently corrupts conflict detection), `utils/tiptap.ts` (bidirectional rich-text conversion with tricky link node/mark and list-item handling), `server/cart.ts` (parsing, totals, VAT, shipping threshold), and `buildPageNav`. A regression in any of these either corrupts data in Shopify or breaks checkout math.

**M2 — No CI, and the lint script fails today.** There is no `.github/workflows`. `npm run lint` currently reports Prettier violations in 152 files, so the one style gate that exists is red and therefore ignored. `svelte-check` passes with 0 errors and 7 warnings (mostly Svelte 5 `state_referenced_locally` in admin pages — real, small bugs where initial values won't react).

**M3 — Documentation drift (misleads agents).** CLAUDE.md and code comments contradict the implementation in ways that will send future agents down wrong paths:
- CLAUDE.md ¶1 and the `sync/index.ts` header say product/variant push is "not yet implemented"/"unsupported" — it **is** implemented (`productUpdate`, `productVariantsBulkUpdate`, `metafieldsSet`, media create/reorder/delete in `gateway.ts`).
- CLAUDE.md says `register-webhooks` "references scripts that don't exist yet" — `scripts/register-webhooks.ts` exists and works.
- CLAUDE.md says `db:migrate:*` hardcode a migration filename — they now use `wrangler d1 migrations apply`.
- CLAUDE.md says `/admin/settings` is not built — it is.
- README.md is still the untouched `sv` template.

**M4 — Repo hygiene.** 3.2 MB `schema-admin.graphql` and 476 KB `worker-configuration.d.ts` are committed generated files (defensible for gql.tada/typegen reproducibility, but consider Git LFS or regeneration docs). CLAUDE.md mentions a stray empty `local.db`; it is properly gitignored and absent from the index.

**M5 — Scalability notes (fine today, worth a comment).** `dirtyProducts`/`dirtyVariants`/`dirtyMetaobjects` load entire tables and filter in JS, and the storefront layout loads all page metaobjects on every request to build the nav. For a small publisher's catalog on D1 this is fine; if the catalog grows, push dirty detection into SQL (`updated_at > last_synced_at`) and cache the nav.

### Design & usability

The admin UI has grown well: list search/filter/sort reusing the storefront facet engine, clickable rows, per-card sync status on the dashboard, unsaved-change gating with Discard, per-record revert-to-Shopify, and a stepped import with progress. The storefront has faceted filtering with a keyboard-accessible price histogram slider, edition deep-links (`/bok/<handle>/<isbn>`), canonical 301s for category URLs, sitemap/robots/SEO/JSON-LD, and sensible handling of out-of-print (0 kr / discontinued) editions. Swedish-language UX details (VAT rate, öre amounts, withdrawal right per Dir. 2023/2673, gapless receipt numbers) show real domain care.

Smaller gaps: no visible loading/error states audit was performed in this review (no running instance); the 7 svelte-check warnings include two admin pages capturing `data` non-reactively, which can show stale UI after navigation between records.

---

## Action plan

Tasks are ordered by priority and sized for independent pickup by an agent. Each should land as its own PR with `npm run check` green.

### P0 — Security (do first, in order)

- [ ] **T1. Guard all admin remote functions.** Add `await requireAdmin(getRequestEvent())` at the top of every exported `form`/`command`/`query` in `authors.remote.ts` (3), `pages.remote.ts` (3), and `products.remote.ts` (`updateProduct`, `updateVariant`). Follow the existing pattern in `orders.remote.ts`. *Size: S (~30 lines).*
- [ ] **T2. Make the guard structural, not per-function.** Prevent regression of T1: either (a) a server hook that rejects unauthenticated requests to `/_app/remote/*` whose module lives under `routes/admin/`, or (b) a Vitest test that imports every `src/routes/admin/**/*.remote.ts`, invokes each export without auth, and asserts 401. Option (b) pairs naturally with T4. *Size: M.*
- [ ] **T3. Sanitize HTML at the storefront render boundary.** Introduce a small allowlist sanitizer (e.g. `sanitize-html` is too heavy for Workers; prefer a tight custom pass or `dompurify` with a Workers-compatible DOM) applied to `product.description` before `{@html}` on `(storefront)/+page.svelte` and `bok/.../+page.svelte`, and to the output of `convertSchemaToHtml`. Keep the admin editor unchanged. *Size: M.*
- [ ] **T4. Promote `SHOPIFY_ADMIN_ACCESS_TOKEN` (and `SHOPIFY_WEBHOOK_SECRET`, `STRIPE_*`, `RESEND_API_KEY`) to Wrangler secrets**; document the exact `wrangler pages secret put` commands in CLAUDE.md. *Size: S.*

### P1 — Reliability

- [ ] **T5. Add Vitest + unit tests for the sync core.** Cover `conflict.ts` (every `SyncDecision` branch, timestamp normalization incl. SQLite `CURRENT_TIMESTAMP` format), `fields.ts` hashing (stability, ordering, gid list normalization), and `metaobjectToWrite`. *Size: M.*
- [ ] **T6. Unit tests for rich-text conversion and cart.** `tiptap.ts` round-trips (link node⟷mark, list-item paragraph wrapping, unknown-node handling) and `cart.ts` (cookie parsing edge cases, qty clamping, VAT, free-shipping threshold). *Size: M.*
- [ ] **T7. Fix Prettier drift and add CI.** Run `npm run format` (one mechanical commit), then add a GitHub Actions workflow running `npm ci`, `npm run check`, `npm run lint`, `npm test` on PRs and main. *Size: S.*
- [ ] **T8. Fix the 7 svelte-check warnings**, especially the non-reactive `data` captures in `admin/products/[id]` and `admin/authors` pages (`$derived` or `$state` initialized in `$effect`). *Size: S.*

### P2 — Documentation & hygiene

- [ ] **T9. Refresh CLAUDE.md and stale code comments** per M3 (sync status, register-webhooks, migrate scripts, settings page). Accuracy here directly improves every future agent run. *Size: S.*
- [ ] **T10. Write a real README** — what the project is, architecture sketch, local setup (miniflare D1 path, import flow), deploy steps, links to CLAUDE.md. *Size: S.*

### P3 — Product polish / robustness

- [ ] **T11. Automate rebase after import.** The stepped browser import (and CLI import) should refresh `shopify_field_hash`/`shopifyUpdatedAt` itself instead of requiring a manual `npm run sync -- --rebase`. *Size: M.*
- [ ] **T12. Audit webhook topic coverage.** Verify create/delete topics (products/create, products/delete, metaobject deletes) are registered and handled so D1 doesn't drift when records are added/removed in Shopify; document the covered topics in CLAUDE.md. *Size: M.*
- [ ] **T13. SQL-level dirty detection + nav caching** (see M5) — only when catalog size or traffic warrants; leave a comment-marker until then. *Size: M, deferred.*

---

*This review was committed to the repository so follow-up agents can pick tasks directly from the checklist above. Suggested workflow: one task per branch/PR, check off the box in this file in the same PR.*
