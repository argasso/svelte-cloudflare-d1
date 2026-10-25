---
name: argasso-design
description: Argasso bokförlag brand + design system — colors, typography, spacing, radius, and UI conventions. Use when building or restyling any storefront page, admin screen, email, or artifact so the work stays on-brand.
---

# Argasso design system

Argasso bokförlag is a small Swedish book publisher (children's, young-adult, and
non-fiction / facts books). The visual identity is a **deep raspberry/wine** over
warm neutrals — confident and literary, but friendly and approachable for young
readers and the adults buying for them. Interfaces should feel calm, legible, and
uncluttered: the books (covers) are the hero, the chrome stays quiet.

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

## Typography

- **Family:** the system font stack (`ui-sans-serif, system-ui, …`). No custom
  web font is loaded — keep it that way unless the brand deliberately adopts one
  (it's fast, neutral, and renders Swedish å/ä/ö everywhere). A serif stack
  (`ui-serif, Georgia, …`) is available for editorial flourishes but isn't the default.
- **Headings:** bold, tight. `h1` = `text-3xl`/`text-4xl` (`1.875`–`2.25rem`); hero
  type up to `~4.5rem`. Page titles are plain bold, not uppercased.
- **Body & rich text:** render editorial content (book descriptions, author bios,
  page content) inside Tailwind Typography `prose` capped at `max-w-none`/`65ch`.
- **Language:** the storefront is **Swedish** — all customer-facing copy, labels,
  and microcopy are in Swedish (`Sök`, `Lägg i varukorg`, `Varukorg`, `Böcker`,
  `Författare`). Admin UI is English.

## Spacing & layout

- **Scale:** Tailwind's default spacing. Dominant steps: `0.5 / 0.75 / 1 / 1.5 /
  2 / 2.5rem` (`gap-2`…`p-10`). Section rhythm is generous: `py-8` page padding,
  `mt-10` between major sections.
- **Container:** `container mx-auto px-4`. Breakpoints `sm 640 / md 768 / lg 1024
  / xl 1280`. Narrow reading/forms: `max-w-xl`–`max-w-2xl`; prose `65ch`.
- **Book grids:** responsive `grid-cols-2 → md:3 → lg:4`, covers in `aspect-[3/4]`
  rounded containers with a muted placeholder when there's no image.
- **Radius:** `--radius: 0.5rem` base (cards, inputs, buttons). Pills `9999px`
  (badges, cart count); author portraits are full circles (`rounded-full`).

## Components & patterns

- Built on **vendored shadcn-svelte** components (`src/lib/components/ui/`, Svelte 5
  runes, Tailwind, bits-ui). Reuse these; don't introduce a second UI kit.
- Borders are thin (`border`, 1px) in the tinted `--border`; elevation is subtle
  (soft shadows, not heavy). Let whitespace and covers do the work.
- Interactive elements show a clear focus ring (`focus:ring-2 focus:ring-ring`).
- Icons: `@lucide/svelte`, `h-4 w-4`–`h-5 w-5`, `opacity-60` when secondary.

## Principles

1. **Covers first.** Book imagery is the focal point; chrome recedes.
2. **One accent.** The raspberry is the single brand signal — everything else is
   neutral. Resist adding more hues.
3. **Calm & legible.** Generous spacing, strong type hierarchy, high contrast.
4. **Swedish, warm, trustworthy.** Friendly for young readers without being childish;
   clear and reassuring for the parents/teachers/librarians who buy.
5. **Accessible.** Real focus states, sufficient contrast, semantic markup; both
   light and dark themes.

<!--
The color/type/spacing/radius tokens are measured from argasso.se and are factual.
The "Principles" and brand-personality paragraph are the current articulation of
the brand voice — refine them over time (hard do/don'ts, logo usage, imagery style
— photographic vs illustrated —, a secondary/seasonal color, Swedish tone).
-->
