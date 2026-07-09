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
- `ui/Chip` — selectable pill (2px ink border; fills green when selected). Used
  for the match type/format choices; reusable for any one-of-many selection.

**Auth**
- `auth/SignInForm` — email + password sign-in (client, `useActionState`).
- `auth/SignUpForm` — create-account (name + email + password).

**Match**
- `match/LogMatchForm` — the log-match wizard (design screen 03): 3 steps
  (matchup → type & format → per-set scores), shared pure validation, submits via
  the `submitMatch` server action. Submission only — no confirm/approve/scoring.

Planned next (from ARCHITECTURE.md): `Card`, `RankBadge`, `StatBlock`.
