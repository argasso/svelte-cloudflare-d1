---
name: argasso-design
description: Argasso bokförlag brand + design system — colors, typography, spacing, radius, and UI conventions. Use when building or restyling any storefront page, admin screen, email, or artifact so the work stays on-brand.
---

# Argasso design system

Argasso bokförlag is a small Swedish book publisher of **easy-to-read** children's,
young-adult, and non-fiction books, with a craft focus on **well-written text**.
The site should carry that value into its own feel — it should **read like a
well-written book**: typographic, calm, and spacious, never cramped. The deep
raspberry/wine over warm neutrals is the one accent; the books (their covers) are
the hero and the chrome stays quiet. The primary audience is **schools and
libraries**, but the tone can be warm and a little informal rather than stiff.

> Source of truth: the tokens below originate from the live site argasso.se
> (shadcn HSL variables). The local app implements them in `src/app.css` as
> Tailwind v4 **oklch** values (`:root` for light, `.dark` for dark), converted
> from those HSL tokens — so storefront, admin, and emails all render in the brand.
> Edit `src/app.css` to retune a color; keep this table in sync.

## Color

Defined as shadcn HSL CSS variables (`hsl(var(--token))`). The neutral ramp is
intentionally **tinted at hue 336** (warm raspberry-grey), not pure grey.

| Token | Light `H S% L%` | ≈ Hex | Role |
| --- | --- | --- | --- |
| `--primary` | `336 100% 20%` | `#660029` | Primary actions, brand accents |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | Text/icons on primary |
| `--ring` | `336 100% 20%` | `#660029` | Focus ring |
| brand-mid *(accent red)* | `336 100% 31%` | `#9e003e` | Hover/active, decorative borders |
| `--background` | `336 0% 98%` | `#fafafa` | Page background |
| `--foreground` | `336 0% 10%` | `#1a1a1a` | Body text |
| `--card` | `336 0% 96%` | `#f5f5f5` | Cards / raised surfaces |
| `--muted` | `298 10% 91%` | `#e9e3ea` | Muted backgrounds (shifts toward purple) |
| `--muted-foreground` | `336 0% 40%` | `#666` | Secondary text |
| `--accent` | `298 10% 90%` | `#e7e1e8` | Hover surfaces |
| `--secondary` | `336 10% 90%` | `#e8e2e5` | Secondary buttons/chips |
| `--border` / `--input` | `336 20% 82%` / `336 0% 60%` | `#d6c7ce` | Hairlines, inputs |
| `--destructive` | `0 50% 50%` | `#bf4040` | Errors / danger |
| `--brand-secondary` *(teal)* | oklch `0.55 0.09 180` | `#0f766e` | **Secondary accent** (petrol teal) — tags, callouts, secondary links; never the primary action |

The secondary also has `--brand-secondary-soft` (pale tint for tag/callout backgrounds) and
`--brand-secondary-foreground` (text on that tint), each with tuned light + dark values
(dark: accent toned down, soft lightened). Tailwind utilities: `bg-brand-secondary`,
`text-brand-secondary`, `border-brand-secondary`, `bg-brand-secondary-soft`,
`text-brand-secondary-foreground`. Use it sparingly for *non-action* roles only (category /
series tags, informational callouts, secondary links, illustration/chart accents) — it must
never read as the buy/primary CTA, and it's clear of the status colors (success/warning/destructive).

**Dark mode is supported** — `--primary` brightens to `336 100% 38%` (`#c2004e`) so
it stays vivid on dark surfaces; style both themes (`prefers-color-scheme` +
`data-theme` overrides) rather than committing to one.

Usage rules:
- Use `--primary` sparingly — primary buttons, active states, key links, the sale
  price. It carries the brand; overusing it cheapens it.
- Never hard-code hex in components; reference the CSS variables (or Tailwind
  classes mapped to them: `bg-primary`, `text-primary`, `border`, `bg-muted`…).
- The sale/discount pattern: current price in the brand red, original price struck
  through in muted-foreground (see the storefront book page).

**Brand gradient** — the header and footer are full-width bands of a left-to-right
gradient between the two brand reds: `linear-gradient(90deg, #660028, #9e003e)`
(the `.gradient` utility; `.gradient-inverted` reverses the stops), with
white / near-white text (`text-white`; footer `text-gray-100`). This is the
signature brand device — reserve it for those bands (and the occasional hero
flourish), not general surfaces.

## Logo

Two lockups, both set in **Albertus** (the brand display typeface):
- **Wordmark** — the full name *Argasso* in Albertus. The primary logo.
- **Monogram** — just the **A** in Albertus, for tight or square contexts
  (favicon, avatar, app icon, compact/mobile header).

Assets (both glyphs as **outlined paths**, so Albertus isn't needed as a webfont;
taken from the current site): the wordmark at `src/lib/assets/logo.svg` (viewBox
`0 0 830 229`) and the monogram at `src/lib/assets/logo-monogram.svg` (the "A",
viewBox ~`0 0 206 200`). Both are `fill="currentColor"` — color with a text class:
`text-white` on the gradient header/footer and dark surfaces, `text-foreground` or
`text-primary` on light. The storefront header renders the wordmark inline
(imported `?raw` + `{@html}`) so it inherits the white text color. Preserve the
aspect ratios; don't distort.

**Colors:** white, black, or the primary raspberry (`--primary`, `#660029`) only —
chosen for contrast. No other colors, gradients, or effects on the logo.

**Clear-space & minimum size.** Keep clear-space around the logo of at least **½
the cap-height of the "A"** on every side — nothing (text, edges, other marks)
should intrude. Legibility floor: **wordmark ≥ ~20px tall, monogram ≥ ~16px** (the
header uses the wordmark at ~32px). (A 150px minimum would be far too large for a
logo — that's a listing-cover height, not a logo floor.)

**Favicon / PWA icons** (the "A") live in `static/`: `favicon.svg` / `favicon.ico` /
`favicon-96x96.png`, `apple-touch-icon.png`, `web-app-manifest-192/512.png`, and
`site.webmanifest` (`theme_color #660028`). Wired in `app.html`. Shared with the
live site. (`favicon.svg` is a ~130 KB embedded PNG — fine, but a true vector would
be lighter if ever regenerated.)

## Typography

- **Family — sans throughout, serif as an accent.** Body, UI, and headings all use
  the sans-serif system stack (`ui-sans-serif, system-ui, …`): fast, neutral, and it
  renders Swedish å/ä/ö everywhere. A serif stack (`ui-serif, Georgia, …`), usually
  *italic*, is used as an **editorial accent** for secondary / subtitle headings
  (e.g. the italic subtitle under the hero) — **never for body text**. No custom web
  font is loaded; the system fonts are intentional and good — keep them unless the
  brand deliberately adopts one.
- **Headings:** `h1` is sans, semibold, `text-3xl` → `md:text-5xl`; plain, not
  uppercased. Subtitles may be serif *italic*, often tinted (e.g. `text-red-100`
  on the gradient header). Keep the scale restful.
- **Body & rich text:** render editorial content (book descriptions, author bios,
  page content) inside Tailwind Typography `prose` capped at `max-w-none`/`65ch`.
- **Readability is first-class.** The brand is about well-written, easy-to-read
  text, so treat type as the main design material: comfortable size and
  line-height, restful measure (~65ch), clear hierarchy. The book-like feel comes
  from careful sans typography and generous spacing — with the occasional
  serif-italic flourish — not from setting long-form text in serif.
- **Language:** the storefront is **Swedish** — all customer-facing copy, labels,
  and microcopy are in Swedish (`Sök`, `Lägg i varukorg`, `Varukorg`, `Böcker`,
  `Författare`). Admin UI is English.

## Spacing & layout

- **Scale:** Tailwind's default spacing. Dominant steps: `0.5 / 0.75 / 1 / 1.5 /
  2 / 2.5rem` (`gap-2`…`p-10`). Section rhythm is generous: `py-8` page padding,
  `mt-10` between major sections.
- **Container:** `container mx-auto px-4`. Breakpoints `sm 640 / md 768 / lg 1024
  / xl 1280`. Narrow reading/forms: `max-w-xl`–`max-w-2xl`; prose `65ch`.
- **Book grids:** responsive `grid-cols-2 → md:3 → lg:4` with generous gaps
  (`gap-4`/`gap-6`) — err toward more breathing room, never cramped.
- **Covers are the focal point.** Present them at their natural proportions
  (~2:3) in **set sizes** — a smaller size on category/listing grids, a larger one
  on the book detail page (the `mediaImage` `card` vs `detail` variants). Covers
  fill a fixed box (`object-fit: cover` at ~2:3, so standard covers show whole)
  over a muted placeholder when there's no image. Don't distort or heavily crop.
- **Radius:** `--radius: 0.5rem` base (cards, inputs, buttons). Pills `9999px`
  (badges, cart count); author portraits are full circles (`rounded-full`).

## Components & patterns

- Built on **vendored shadcn-svelte** components (`src/lib/components/ui/`, Svelte 5
  runes, Tailwind, bits-ui). Reuse these; don't introduce a second UI kit.
- Borders are thin (`border`, 1px) in the tinted `--border`; elevation is subtle
  (soft shadows, not heavy). Let whitespace and covers do the work.
- Interactive elements show a clear focus ring (`focus:ring-2 focus:ring-ring`).
- Icons: `@lucide/svelte`, `h-4 w-4`–`h-5 w-5`, `opacity-60` when secondary.
- **Header & footer:** full-width brand-gradient bands with white / near-white text
  (see Color). The footer is deliberately generous — `py-12`, `gap-10`, uppercase
  tracked section labels in `white/70`, link lists, a subtle `white/20` divider.
- **Book hover lift:** book cards lift gently on hover — `transform: scale(1.01)`
  plus a soft elevated shadow (`box-shadow: 0 16px 40px rgba(0,0,0,.16)`) with a
  short transition. It's a signature micro-interaction; keep it this subtle.

## Accessibility & progressive enhancement

Accessibility is a **core value**, not an afterthought — hold the customer-facing
storefront to a high bar (admin may lean on JS and is lower priority).

- **Semantic, focusable controls.** Anything clickable is a real `<a href>`
  (navigation) or `<button>` (action) — never a `<div>`/`<span>` with `onclick`. That
  makes it keyboard-operable (Tab, Enter/Space) and exposed to assistive tech for free.
- **Visible focus.** Every interactive element shows a clear focus ring on keyboard
  focus (`focus-visible:ring-…`; use `ring-white` on the gradient header). Never strip
  an outline without replacing it.
- **Hand cursor.** Clickable things show the pointer/hand cursor (`cursor-pointer`).
  Native `<a href>` does already; a `<button>` does **not** by default, so the shadcn
  `Button` sets `cursor-pointer` in its base — add it to any bare `<button>` too.
- **Accessible names.** Icon-only buttons/links need an `aria-label`; images need a
  meaningful `alt` (book title / author name), decorative images `alt=""`.
- **Structure.** One `<h1>` per page, logical heading order, landmark regions
  (`<header> <nav> <main> <footer>`), real lists for lists.
- **Contrast & motion.** Meet WCAG AA (watch faint text like `white/70` on the
  gradient); respect `prefers-reduced-motion` for the hover lift and other animation.
- **Progressive enhancement (customer-facing).** Core flows should work with
  JavaScript **off**, via SvelteKit's native form fallback:
  - Reads, navigation, search, filters and paging already degrade — they're
    `<a href>` links and `method="GET"` forms (with `<noscript>` submit); JS only enhances.
  - Mutations a customer must perform (add to cart, change qty, checkout) should be
    SvelteKit remote **`form()`** (or form actions): a real `<form method="post" action>`
    + submit button, so a no-JS submit does a native POST and the server responds;
    `.enhance()` upgrades it. Prefer `form()` over `command()` here.
  - Admin can rely on JS (`command()`/`query()`); its interactivity needn't degrade.

## Principles

1. **Reads like a book.** Typography and readability come first — a well-made
   reading experience that mirrors the care that goes into the books. Clear
   hierarchy, comfortable measure, restful rhythm.
2. **Room to breathe.** Spacing is a feature, not decoration. Generous, consistent
   whitespace; never cramped. When in doubt, add space.
3. **Covers first.** Book covers are the focal point, shown at their natural
   proportions in consistent set sizes — smaller on listings, larger on detail.
4. **One primary accent.** The raspberry is the single *action* signal; a petrol
   **teal** serves limited *secondary* roles (tags, callouts, secondary links),
   never competing with it. Everything else stays neutral — resist adding further hues.
5. **Fast.** The site should feel instant — small SSR payloads, lazy images,
   hover-preload, paging over long lists. Speed is part of the brand.
6. **Every device; drawers on mobile.** Fully responsive from large screens to
   phones. On small screens, use the drawer pattern (vaul) for navigation and
   filters rather than cramming controls inline.
7. **Swedish, warm, a little informal.** Clear and reassuring for schools and
   libraries, friendly without being childish or stiff.
8. **Accessible by default.** We care deeply: semantic focusable controls, visible
   focus, hand cursor, labels, WCAG-AA contrast, light + dark — and customer-facing
   flows that still work with JavaScript off (see Accessibility & progressive
   enhancement).

<!--
Colour/type/spacing/radius + the brand gradient, heading pattern, book-hover lift,
logo (wordmark + monogram, clear-space/min-size) and the secondary teal are
measured from / tuned against argasso.se and implemented in the repo (app.css +
storefront). Personality + principles reflect Robert's stated brand voice. Nothing
major open — revisit a seasonal/campaign colour only if wanted.
-->
