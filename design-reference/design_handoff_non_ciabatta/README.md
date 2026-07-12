# Handoff: Non-Ciabatta Opponents — feature addition to Ciabatta Cup

## What this is
An addition to the existing Ciabatta Cup app (see `design_handoff_ciabatta_cup/` for the base handoff): players can log matches against people who aren't in the Ciabatta Cup. These are **automatically unranked**, award a **flat +10 points per match (win or lose)**, and the opponent's name can be **saved to the player's own profile** for personal head-to-head history — the opponent is never invited and never appears on the ladder.

## Design reference
`Non-Ciabatta Feature Screens.dc.html` — open in a browser. Contains:
1. **Log match, step 1** — opponent picker with a "Non-Ciabatta opponent" option below a "NOT ON THE LADDER?" divider (dashed green treatment, sub-label "UNRANKED · FLAT +10 PTS").
2. **Log match, step 2 (non-Ciabatta variant)** — opponent-name text input; chips of the player's previously saved non-Ciabatta opponents (tap to reuse); "Save name to my profile" checkbox with callout copy; match type **locked to Unranked** (Ranked shown disabled: "CIABATTA ONLY"); per-set score entry; submit button "Log unranked match".
3. **Front page history** — expanded leaderboard player history gains a highlighted line `1-0 NON-CIABATTA MATCH HISTORY` (+ UNRANKED pill, +10 PTS); plus a match-feed row format: "Kumove d. Dave from work 6-4, 6-2 · NON-CIABATTA · UNRANKED · NO LADDER MOVEMENT · +10".

`Non-Ciabatta Match Email.dc.html` — transactional email (600px), sent after a non-Ciabatta match is logged. Zeus-voiced. Dynamic fields are literal tokens: `{{firstName}}`, `{{opponentName}}`, `{{score}}`. Shown is the **win** variant; for a loss, keep the same shell and swap headline/quote tone (points line is identical — +10 flat either way).

## Behavior rules
- Selecting a non-Ciabatta opponent forces `type = unranked` — the user cannot choose Ranked. Skip opponent confirmation AND admin approval: the match is recorded and +10 applied instantly on submit.
- **+10 flat per match, win or lose.** Not Elo-calculated; does not affect Elo rating math, rank movement arrows, ranked W–L, streaks, or last-5 dots. It adds to ladder points only (matching how tournament placement points already work).
- Saved opponent names are **per-player, private**: only visible on the saving player's profile/history. No invite, no account, no ladder presence.
- Non-Ciabatta record is displayed as its own line ("N-N NON-CIABATTA MATCH HISTORY"), never mixed into ranked or exhibition records.
- Email fires on submit (no approval stage to wait for).

## Schema changes (delta to SCHEMA.md)
See `SCHEMA-DELTA.md`.

## Design tokens
Same system as the base handoff (`design_handoff_ciabatta_cup/README.md`): cream `#EFE6D0`, surface `#F7F0DE`, ink `#1B1A16`, green `#3E6B35`, chartreuse `#C9DA5A`, rust `#A0442C`, muted `#8C8672`, hairline `#D9CCAE`; Bricolage Grotesque / IBM Plex Mono / Work Sans; 2px ink borders, solid offset shadows. New pattern introduced: **dashed borders** (green or hairline) signal "outside the ladder" — the non-Ciabatta picker option and the disabled Ranked toggle both use it.

## Files
- `PROMPT.md` — **paste-ready prompt for the implementing agent (start here)**
- `Non-Ciabatta Feature Screens.dc.html` — screens (open in browser)
- `Non-Ciabatta Match Email.dc.html` — post-match email
- `SCHEMA-DELTA.md` — data model changes
- `players/`, `assets/` — images referenced by the HTML
