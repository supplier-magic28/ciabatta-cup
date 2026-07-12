# Prompt for Codex

Paste this (or point Codex at this file) from the ciabatta-cup repo root, with `design_handoff_profile_updates/` placed in the repo (e.g. under `design-reference/`):

---

Implement the **Player Profile Updates** in this codebase, following the handoff in `design_handoff_profile_updates/`.

Read in this order:
1. `README.md` — feature overview and behavior rules
2. `SCHEMA-DELTA.md` — data model changes (new `play_days` table; everything else derived)
3. `Profile Updates Screens.dc.html` — hi-fi design reference (open in a browser; reference HTML, not production code — recreate with this repo's components and patterns)

Scope of work:
- **Tab structure**: restructure `app/profile` into three tabs — **Settings / Streak / History** — matching the design's segmented tab bar (ink-filled active tab). Preserve the active tab across reload/back (route segments preferred: `/profile`, `/profile/streak`, `/profile/history`). Reuse `SiteHeader`, the "YOUR ACCOUNT / Profile" header, and existing primitives (`ui/Chip`, `ui/Button`, `players/PlayerAvatar`).
- **Settings tab**: mount the existing `ProfileSettingsForm` unchanged (picture, nickname, name-shown preference, save, account-name footnote).
- **Streak tab**: tennis-ball day tracker per the design — green ball = played, rust ball = not played; LAST 7 DAYS / LAST 30 DAYS toggle (7-day: 44px balls + weekday labels + today ring; 30-day: denser grid); stat cards for current streak, best streak, days played. A day counts as played if the player has ANY match with that `played_at` date — any type, and explicitly including tournament fixture matches (tournament_id set) as well as casual and non-Ciabatta matches — OR a manual mark. Add a test asserting a tournament match day counts toward the streak. Add an "I played today" control that inserts into the new `play_days` table (today only, un-markable). Derivation stays pure/rebuildable per ADR-0001 — no stored streaks.
- **History tab**: secondary pill toggle **H2H / Tournaments** below the main tabs.
  - **H2H**: opponent picker chips — Ciabatta players (solid ink, selected = ink-filled) and the player's saved non-Ciabatta names (dashed green), respecting existing owner-only privacy. Selected opponent renders the dark summary card (W–L, sets, games, last result). Below, always render **ALL MATCHES**: the player's full match history (ranked with ± points, exhibition with —, non-Ciabatta with +10), newest first.
  - **H2H gate**: introduce a shared constant `H2H_MIN_GAMES = 5`. Opponents below it get a muted chip with `played/N` count; selecting one shows the dashed gate panel — "See more statistics with at least N H2H games", progress bar (played/N), "X more to unlock the full head-to-head", plus the note that results still show in the match list. All copy and the bar must derive from the constant.
  - **Tournaments**: list tournaments the player entered (tournament_participants), as cards with cover photo (`cover_image_url`, fallback treatment if null), name, status badge (WON for placement 1, otherwise ENTERED/placement), summary line (date · structure · player count · venue), result line (placement, fixture-match record, points from tournament_placements). Each card links to `/tournaments/[id]`.

Constraints:
- Follow repo conventions: CLAUDE.md / AGENTS.md, `components/tokens.ts` design tokens, ADRs in `docs/decisions` (write a new ADR for the streak-derivation rule), keep `components/README.md` inventory current.
- New migration for `play_days` with owner-only RLS per `SCHEMA-DELTA.md`.
- Add tests: streak derivation (match + manual union, current/best streak edge cases), H2H gate threshold behavior, tab routing.
- Loading states use the existing skeleton system (`loading/PageSkeletons`) — add route-shaped skeletons for the new tabs.

---
