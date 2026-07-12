# Handoff: Player Profile Updates — Ciabatta Cup

## What this is
A restructure of the profile page (`app/profile`) from one long scroll into a **tabbed layout**, plus two new capabilities: a **tennis streak** tracker and a **match history** view with head-to-head and tournament sub-views.

## Design reference
`Profile Updates Screens.dc.html` — open in a browser. Four page states, left to right:

1. **Settings tab** — the existing `ProfileSettingsForm` content (picture change/remove, nickname, use-real-name/use-nickname radios, save, account-name footnote) condensed into the first tab. No functional changes.
2. **Streak tab** — tennis-ball day tracker:
   - Green ball = played tennis that day; rust-red ball = no tennis.
   - Toggle: LAST 7 DAYS (large balls + weekday labels, today ringed) / LAST 30 DAYS (denser 10-column grid).
   - Stat cards: current streak (dark card, chartreuse number), best streak, days played in period.
   - A day turns green from **any match** — casual logged matches, non-Ciabatta matches, AND tournament fixture matches (their played_at derives from the event) — or a **manual "I played today" tap**.
3. **History tab → H2H** (sub-toggle pills below the main tabs) — opponent picker chips (Ciabatta players solid ink; saved non-Ciabatta names dashed green); selected opponent shows a dark H2H summary card (W–L, sets, games, last result). Below it: **ALL MATCHES** — the full historical list regardless of selection (ranked / exhibition / non-Ciabatta rows with points deltas).
   - **H2H gate**: opponents with fewer than N H2H games (default **5**, config constant) show a muted chip with a `played/N` count and, when selected, a dashed panel instead of the summary: "See more statistics with at least N H2H games", progress bar, "X more to unlock". Match-list rows still show; only summary stats are gated.
4. **History tab → Tournaments** — entered tournaments as tappable cards: cover photo (from `tournaments.cover_image_url`), name, status badge (WON / ENTERED), summary line (date · structure · players · venue), result line (placement · match record · points awarded). Tapping navigates to that tournament's page (`/tournaments/[id]`).

## Behavior rules
- Tabs are routed or state-preserved so a reload/back returns to the same tab.
- Streak "played" days derive from ALL of the player's matches' `played_at` — including tournament-linked matches (tournament_id set) and unranked_external — plus manual marks; manual marks are same-day only (no backfilling beyond today) — decide and document.
- The H2H minimum-games threshold is a single shared constant (design default 5) used by chip counts, gate copy, and the progress bar.
- H2H vs a saved non-Ciabatta opponent remains owner-private (existing Phase 6 RLS rules).
- Tournament cards derive from tournament_participants + tournament_placements; no new storage.

## Schema changes
See `SCHEMA-DELTA.md` (one new table for manual play marks; everything else derived).

## Design tokens
Same system as the app (`components/tokens.ts` / base handoff): cream `#EFE6D0`, surface `#F7F0DE`, ink `#1B1A16`, green `#3E6B35`, chartreuse `#C9DA5A`, rust `#A0442C`, muted `#8C8672`, hairline `#D9CCAE`; Bricolage Grotesque / IBM Plex Mono / Work Sans; 2px ink borders, solid offset shadows. Streak balls use a subtle radial highlight (see the HTML); dashed borders continue to mean "outside the ladder" (non-Ciabatta chips) or "locked/empty" (gate panel).

## Files
- `PROMPT.md` — **paste-ready prompt for the implementing agent (start here)**
- `Profile Updates Screens.dc.html` — hi-fi screens (open in browser)
- `SCHEMA-DELTA.md` — data model changes
- `players/`, `assets/`, `support.js` — files referenced by the HTML
