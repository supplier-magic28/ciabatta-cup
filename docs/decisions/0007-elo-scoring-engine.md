# ADR-0007: Elo scoring engine — parameters, input contract, and history shape

- **Status:** Accepted (implements ADR-0001/ADR-0003 for the scoring engine)
- **Date:** 2026-07-10

## Context

Phase 3b replaces the placeholder `computeRankings` (which ranked by raw win
count) with the real scoring engine. ADR-0001 fixes the big rule — scoring is a
pure function of immutable match facts, never stored authoritatively — and
`docs/SCHEMA.md` recommends Elo (K=32, floor 100, start 1000). Turning that into
code forces several concrete choices that the recommendation leaves open: what
exactly the function takes and returns, how matches are ordered, how rounding and
the floor interact, and what the returned `rating_history` looks like.

This engine is the project's test spine, so these choices are pinned by tests
first. It stays pure: it **returns** the data; it does not write to the database
(materialising `rating_history` / `rating_points` is a later phase).

## Decision

**1. Elo parameters** (in `lib/scoring/constants.ts`): `START_RATING = 1000`,
`K_FACTOR = 32`, `RATING_FLOOR = 100`, `ELO_DIVISOR = 400`. Standard logistic
expected score `E = 1 / (1 + 10^((Rb − Ra)/400))`; `R' = R + K·(S − E)`.

**2. Input contract.** `computeRankings(matches: Match[])` takes the **full** set
of match facts, shaped like the `matches` table (`player1Id`, `player2Id`,
`winnerId`, `type`, `status`, `playedAt`) — not a pre-derived winner/loser pair —
so the DB→engine mapping is lossless and unscored rows are representable. The
engine itself filters to the scoring set: **`type === "ranked"` &&
`status === "approved"`**. Everything else (exhibition, pending, queried,
rejected) is ignored for points.

**3. Roster = every participant of any input match.** A player who appears only
in ignored matches is still returned, at `START_RATING` with a zero ranked
record — mirroring the DB, where every `players` row defaults to
`rating_points = 1000`. Ranked W–L counts only the scoring set (records stay
separate, per SCHEMA).

**4. Chronological application ("recompute forward").** The scoring set is sorted
by `playedAt`, then `id`, and folded in that order. Results are therefore
independent of input array order, and a match approved late slots into its
correct chronological position on the next full run — exactly the "recompute
forward from that point" behaviour SCHEMA calls for. Elo is path-dependent, so
this ordering is part of the contract, not an implementation detail.

**5. Per-match integer rounding + floor clamp.** Each updated rating is
`Math.round`ed and then clamped to `RATING_FLOOR`. Rounding per match (rather
than carrying floats and rounding at the end) keeps the returned history an exact
integer chain — each participant's `pointsBefore` equals their previous
`pointsAfter`, which a stored audit trail needs. We knowingly accept two small
consequences: results are **not strictly zero-sum** (independent rounding and the
floor can add/remove a point), and, with K=32, per-match rounding means a losing
streak's deltas round to zero long before 100 — so **the floor is defensive and
essentially unreachable organically**. The floor test asserts the invariant
(never below 100) rather than a contrived clamp.

**6. Returned `rating_history`.** Two entries per ranked+approved match (one per
participant), each with `pointsBefore/After` and `rankBefore/After`, where rank is
the player's position over the **full roster** (rating desc, `playerId` asc)
immediately before vs after that match is applied. Players not in the match whose
rank shifts as a side effect get **no** history row (their points didn't change);
movement arrows over time are derived from ranks elsewhere. Final `rankings` use
the same ordering; **ties break by `playerId`** for now — an interim, deterministic
rule, not a considered shared-rank policy.

## Consequences

- **The formula is now a single, well-tested pure function.** Rebalancing (K, the
  floor, the divisor, even the model) is a constant change plus a re-run; ADR-0001
  guarantees no history migration.
- **The engine is DB-ready but DB-free.** Its output is exactly what the later
  phase needs to write `rating_history` and refresh the `rating_points` cache;
  wiring that (and computing Ciabatta reigns) is explicitly out of scope here.
- **Known interim choices to revisit:** the `playerId` tie-break (a real
  shared-rank/"movement" rule may be wanted for the leaderboard), and the roster
  including exhibition-only players (fine while it mirrors the DB default, but the
  UI may want to filter to `active` players — that's a read-layer concern, not the
  engine's).
- **Non-zero-sum by rounding/floor is accepted** at ~10 users; if it ever matters,
  it gets its own ADR.
