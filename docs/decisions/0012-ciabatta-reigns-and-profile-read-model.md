# ADR-0012: Ciabatta reigns and profile read model

- **Status:** Accepted (Phase 3e)
- **Date:** 2026-07-10

## Context

The leaderboard needs a meaningful holder history, and the player-profile design
needs records, a point trend, head-to-head data, and a match log. Those are all
derived views of the same immutable match facts; making any of them an
independent authority would weaken the scoring model established by ADR-0001.

## Decision

**1. Reigns are a rebuildable scoring output.** `computeRankings` emits holder
periods while replaying approved ranked matches in chronological order. The
first reign starts only after the first approved ranked result, not from an
arbitrary 1000-point tie. A new holder closes the preceding period at that
match's `played_at`.

**2. Reigns materialise with ratings and history.** `ciabatta_reigns` is a
service-role-written cache. A new three-payload replacement RPC refreshes it in
the same transaction as `rating_history` and `rating_points`, while preserving
the Phase 3d two-payload RPC for code-roll-back compatibility.

**3. Profiles are read models, not profile statistics tables.** The route derives
ranked and exhibition records, trends, head-to-head summaries, and match log
from approved facts on read. Avatar upload and profile editing remain later
work; an existing `avatar_url` is displayed when present.

## Consequences

- A late-approved older result rebuilds ratings, history, and reigns together.
- Rebuilding caches is exposed to admins as an explicit recovery control after
  deployment and for operational repair.
- There is no holder before the first approved ranked match, even though the
  general ladder can display 1000-point players.
