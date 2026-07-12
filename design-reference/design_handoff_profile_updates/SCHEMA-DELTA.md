# Schema delta: Player Profile Updates

Changes relative to `docs/SCHEMA.md` in the repo (which already includes Phase 6 non-Ciabatta).

## New table: play_days
Manual "I played today" marks. Match-derived play days are NOT stored — they are derived from match facts, consistent with ADR-0001.

| field | type | notes |
|---|---|---|
| player_id | FK players | composite PK with played_on |
| played_on | date | the local day marked as played |
| created_at | timestamptz | |

- RLS: owner-only read/write; a player can only insert their own rows.
- Insert-only for today's date (server validates); allow delete of own today's row (un-mark).
- unique (player_id, played_on).

## Derived data (compute, don't store)
- **Played-day set** (per player, per window): union of (a) distinct `played_at::date` over EVERY match the player appears in — any type (ranked, exhibition, unranked_external) and both casual AND tournament-linked (tournament_id set; tournament facts derive played_at from the event) — and (b) `play_days.played_on`.
- **Current streak**: consecutive played days ending today (or yesterday if today not yet played — pick one rule and document it in an ADR).
- **Best streak**: longest run in the played-day set (bound the scan, e.g. last 365 days).
- **H2H summary** (existing derivation): per opponent — matches W–L, sets, games, last result. New: **gate** — if H2H match count < H2H_MIN_GAMES (constant, default 5), the summary endpoint/props return only the count, not the stats.
- **Tournament history**: tournaments where the player appears in tournament_participants, joined with tournament_placements (placement, points) and the player's fixture-linked match record in that event.

## Config
- `H2H_MIN_GAMES = 5` — single shared constant (e.g. in lib/), used by UI copy, chip counts, and gating logic.

## No changes to
- matches, match_sets, rating_history, tournaments, external_opponents — untouched.
