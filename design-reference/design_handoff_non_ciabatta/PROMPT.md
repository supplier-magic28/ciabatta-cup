# Prompt for Codex

Paste this (or point Codex at this file) from the ciabatta-cup repo root, with the `design_handoff_non_ciabatta/` folder placed in the repo (e.g. under `design-reference/`):

---

Implement the **Non-Ciabatta Opponents** feature in this codebase, following the handoff in `design_handoff_non_ciabatta/`.

Read in this order:
1. `README.md` — feature overview, behavior rules, screen-by-screen notes
2. `SCHEMA-DELTA.md` — data model changes (build these first: new `external_opponents` table + `matches` changes + points rules)
3. `Non-Ciabatta Feature Screens.dc.html` — hi-fi design reference (open in a browser; it is reference HTML, not production code — recreate in this repo's existing patterns/components)
4. `Non-Ciabatta Match Email.dc.html` — post-match email design

Scope of work:
- **Log match, step 1**: add a "Non-Ciabatta opponent" option to the opponent picker, below a "NOT ON THE LADDER?" divider, styled per the design (dashed green border, "UNRANKED · FLAT +10 PTS" sub-label).
- **Log match, step 2 (non-Ciabatta variant)**: opponent-name text input; chips of the user's previously saved non-Ciabatta opponents (tap to fill); a checked-by-default "Save name to my profile" checkbox with the callout copy from the design (saved for own history only; they won't be invited; never on the ladder); match type locked to Unranked (Ranked disabled, "CIABATTA ONLY"); per-set score entry; submit CTA "Log unranked match".
- **Lifecycle**: non-Ciabatta matches skip opponent confirmation and admin approval — created directly as approved; +10 points applied to the submitter instantly, win or lose. Must NOT affect Elo math, rank-movement arrows, ranked W–L, streaks, or last-5.
- **Front page**: expanded player history gains the "N-N NON-CIABATTA MATCH HISTORY" line (with UNRANKED pill and +10 PTS), and the match feed shows non-Ciabatta results per the feed-row design ("NON-CIABATTA · UNRANKED · NO LADDER MOVEMENT · +10").
- **Email**: on submit, send the post-match email to the submitter, matching `Non-Ciabatta Match Email.dc.html` and the existing lifecycle-email implementation in this repo. Tokens: firstName, opponentName, score. The design shows the win variant; implement a loss variant with the same shell and adjusted headline/Zeus quote (+10 line identical).

Constraints:
- Follow this repo's existing conventions (see CLAUDE.md / AGENTS.md, `components/tokens.ts`, existing match-submission flow, existing email templates in `public/emails`).
- Reuse the existing design tokens; the one new pattern is dashed borders meaning "outside the ladder".
- Add migrations under `supabase/migrations` per `SCHEMA-DELTA.md`; add/update tests to cover the flat-+10 points rule and the skipped approval lifecycle.

---
