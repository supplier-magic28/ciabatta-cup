# Components

The shared UI vocabulary. Screens are assembled from these primitives, driven by
design tokens (`tokens.ts`) — edit a token and everything updates
(ARCHITECTURE.md §3). Keeping this inventory current is part of the Definition
of Done (`CLAUDE.md`).

## Inventory

**Brand**
- `brand/LoafBadge` — the Ciabatta loaf (SVG), the current-holder trophy motif.
- `brand/Wordmark` — "CIABATTA CUP" wordmark, `tone` light/dark.

**UI primitives**
- `ui/Button` — primary action button (green, 2px ink border, offset shadow);
  `loading` preserves its dimensions, disables repeat submission, and exposes
  an accessible pending label.
- `ui/Field` — labelled input; `reveal` adds a password Show/Hide toggle.
- `ui/Chip` — selectable pill (2px ink border; fills green when selected). Used
  for the match type/format choices; reusable for any one-of-many selection.
- `ui/LoadingSpinner` — fixed-size solid spinner for compact pending controls;
  animation stops when reduced motion is requested.
- `ui/Skeleton` — fixed-geometry solid-opacity loading block with
  reduced-motion support.
- `ui/CropZoomControl` — accessible bounded zoom slider with explicit zoom in
  and zoom out controls for image crop editors.

**Loading**
- `loading/PageSkeletons` — route-shaped compositions for leaderboard, auth,
  compact lists, forms, profiles, tournament lists, and tournament boards.

**Layout**
- `layout/SiteHeader` — shared wordmark and primary navigation for the ladder,
  tournaments, matches, admin tools, and sign-out.

**Auth**
- `auth/SignInForm` — email + password sign-in (client, `useActionState`).
- `auth/SignUpForm` — create-account (name + email + password).
- `auth/AcceptInviteForm` — invite-only password setup before profile
  activation (client, `useActionState`).

**Match**
- `match/LogMatchForm` — the log-match wizard (design screen 03): 3 steps
  (matchup → type & format → per-set scores), shared pure validation, submits via
  the `submitMatch` server action. Submission only — no confirm/approve/scoring.
- `match/ConfirmMatchButton` — opponent-side confirm (calls `confirmMatch`); the
  DB trigger advances the status once both players confirm.
- `match/ApprovalActions` — admin Approve / Query / Reject for a `pending_approval`
  match (calls the admin match actions).
- `match/RebuildRatingsButton` — admin recovery control that rebuilds ratings,
  history, and reign caches from immutable facts.

**Players (admin)**
- `players/InvitePlayerForm` — admin invite form (design screen 08): name + email
  → `inviteUser` server action (`useActionState`).
- `players/DeletePlayerButton` — confirmed admin hard-delete for unused players;
  the server refuses self-deletion and any player referenced by a match.
- `players/PlayerAvatar` — Supabase Storage avatar with deterministic initials
  fallback; used by leaderboard and profiles.
- `players/ReignSummary` — hydrated current-holder duration and reign count.

**Tournaments**
- `tournament/NewTournamentForm` — director setup for event details, courts,
  and four ordered participant seeds.
- `tournament/TournamentLifecycleActions` — irreversible draw lock plus
  retry-safe locked-in and game-day email controls.
- `tournament/TournamentAdminActions` — fixture-generation and stage-advance
  controls with inline operational feedback.
- `tournament/TournamentParticipantEditor` — pre-play admin replacement that
  preserves a seed and regenerates the complete round-robin draw.
- `tournament/TournamentBoard` — shared standings and round/court schedule used
  by the player and director views.
- `tournament/TournamentResultForm` — two-step admin score review and atomic
  approval for a scheduled fixture.
- `tournament/TournamentPhotoControl` — admin-only tournament cover upload,
  16:7 crop/resize, replacement, and removal control mounted in the event hero
  tile.

**Profile**
- `profile/ProfileSettingsForm` — self-owned nickname preference and circular
  avatar crop/upload settings with stable pending feedback.

- `auth/PasswordResetRequestForm` - email recovery request with generic
  delivery feedback and stable pending state.
- `auth/UpdatePasswordForm` - recovery-link password replacement; invited
  profiles activate only after the password update succeeds.

Planned next (from ARCHITECTURE.md): `Card`, `RankBadge`, `StatBlock`.
