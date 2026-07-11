# ADR-0025: Zero-based ladder and derived player history

- **Status:** Accepted
- **Date:** 2026-07-11
- **Supersedes:** ADR-0007 and ADR-0014 on the Elo baseline and floor; ADR-0024 on adding a 1000-point baseline to a player's first tournament award

## Context

The 1000-point internal Elo baseline made the first qualifier awards appear as
1100/1050/1020/1010 even though the product language treats 100/50/20/10 as the
points earned. The compact ladder also mixed ordinary-match records with current
status while hiding the distinction between trophies, full sets, and short
tournament matchups.

## Decision

Ordinary ranked Elo starts at zero with K=32 and clamps at zero. Tournament
placement awards add directly to that score. A first equal-rating result is
therefore +16 for the winner and zero for the loser; the completed qualifier is
100/50/20/10 before any ordinary ranked results.

Leaderboard history remains derived from immutable facts. Trophies are ranked
tournament wins. Ordinary ranked matches exclude tournaments. Ranked set W-L
counts ordinary ranked sets and tournament fixtures using the full-set ruleset.
Ranked tournament match W-L includes every approved ranked tournament stage,
including short round-robin fixtures.

## Consequences

- Scores are earned from zero and never become negative.
- Elo is no longer zero-sum when a loss is clamped at zero.
- Existing rating/history/reign caches must be rebuilt after deployment.
- The compact ladder can show trophies and points while expandable rows expose
  the different historical records without storing another aggregate table.
