# Schema delta: Non-Ciabatta Opponents

Changes relative to `design_handoff_ciabatta_cup/SCHEMA.md`.

## New table: external_opponents
Per-player private list of saved non-Ciabatta opponent names.

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | FK players | the Ciabatta player who saved the name |
| display_name | text | e.g. "Dave from work" |
| created_at | timestamptz | |
| unique (owner_id, lower(display_name)) | | dedupe per owner; reuse row when the same name is logged again |

Not a `players` row: no email, no auth, no invite, no ladder presence. Visible only to `owner_id`.

## matches — changes
- `type` enum gains `unranked_external` (alongside `ranked`, `exhibition`).
- New nullable field `external_opponent_id` FK external_opponents.
- For `unranked_external`: `player2_id` is null, `external_opponent_id` is set, `winner_id` references player1 or null (external opponent won → winner_id null + a boolean `external_won` — or model winner as enum `me | them`; pick one and be consistent).
- If the user declines "save name to my profile", still create the match with a transient name column (`external_opponent_name` text) and no `external_opponents` row — the name shows in that match's history only.
- **Lifecycle**: `unranked_external` matches skip `pending_confirmation` and `pending_approval` — created directly as `approved`.

## Points
- On submit of an `unranked_external` match: `+10` flat to the submitter's `rating_points`, win or lose.
- Write a `rating_history` row (points_before/after) so the ladder history stays append-only; it must NOT feed the Elo K-factor math or rank-movement streak/last-5 calculations — those remain ranked-approved-only.
- match_sets works unchanged (p1 = the Ciabatta player, p2 = external opponent).

## Derived data
- New per-player stat: non-Ciabatta W–L (`unranked_external` matches only), shown as "N-N NON-CIABATTA MATCH HISTORY" in expanded leaderboard history and on the profile. Never merged into ranked or exhibition records.
- Head-to-head vs an external_opponent is private to the owner.

## activity_log
- Add verb `external_match_logged`.

## Email trigger
- On `unranked_external` match creation, send the post-match email (see `Non-Ciabatta Match Email.dc.html`) to the submitter. Tokens: firstName, opponentName, score. Win vs loss variants share the shell; +10 line identical.
