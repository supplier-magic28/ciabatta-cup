# Components

The shared UI vocabulary. Screens are assembled from these primitives, driven by
design tokens (`tokens.ts`) — edit a token and everything updates
(ARCHITECTURE.md §3). Keeping this inventory current is part of the Definition
of Done (`CLAUDE.md`).

## Inventory

**Brand**
- `brand/LoafBadge` — the Ciabatta loaf (SVG), the trophy motif; reused for the
  #1 badge later.
- `brand/Wordmark` — "CIABATTA CUP" wordmark, `tone` light/dark.

**UI primitives**
- `ui/Button` — primary action button (green, 2px ink border, offset shadow).
- `ui/Field` — labelled input; `reveal` adds a password Show/Hide toggle.

**Auth**
- `auth/SignInForm` — email + password sign-in (client, `useActionState`).
- `auth/SignUpForm` — create-account (name + email + password).

Planned next (from ARCHITECTURE.md): `Card`, `RankBadge`, `StatBlock`.
