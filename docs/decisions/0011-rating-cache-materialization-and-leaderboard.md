# ADR-0011: Rating cache materialization and leaderboard

- **Status:** Accepted (Phase 3d)
- **Date:** 2026-07-10

## Context

The pure Elo engine is complete, but approved ranked results did not yet become
live ratings. The design handoff's primary screen is the leaderboard, which
needs current points, movement, and a reliable current holder. `rating_history`
and `players.rating_points` were already explicitly defined as rebuildable
derived data in ADR-0003.

Approval order cannot be used as scoring order: an older match may be approved
after newer matches, and Elo is chronological and path-dependent.

## Decision

**1. Rebuild the complete cache after every ranked approval.**
`rebuildRatingCache()` loads every player and every match fact, maps those rows
losslessly into `computeRankings`, and rebuilds forward in the engine's pinned
`played_at`, then id order. Players without match facts remain at 1000. This is
small and predictable for a private group of about ten players, and makes late
approval correct by construction.

**2. Keep scoring in TypeScript; use one database RPC only to replace cache data.**
The new `rating_history` table stores the engine's two rows per approved ranked
match. `replace_rating_cache(jsonb, jsonb)` performs the delete/insert and
`players.rating_points` refresh atomically, but contains no Elo formula. It is
executable by `service_role` only; authenticated users can read rating history
but cannot write derived scores.

**3. The leaderboard derives standings from the same pure adapter, not the cache.**
The root route computes the active ladder from match facts on each request. The
cache remains a read-performance and audit materialisation for future profile
and admin surfaces, never an authority over facts. The first-ranked active player
is presented as the current Ciabatta holder; historical reigns remain a later
phase.

## Consequences

- A failed cache rebuild can leave an approved match with stale derived data;
  the facts are still intact, and the next successful rebuild repairs all cache
  rows. The action reports this explicitly rather than claiming success.
- `SUPABASE_SECRET_KEY` is now required for ranked approval as well as invites.
- Phase 3d adds the leaderboard and current holder, but not `ciabatta_reigns`,
  player profiles, or time-windowed movement rules. Those need their own small
  decisions once real match history exists.
