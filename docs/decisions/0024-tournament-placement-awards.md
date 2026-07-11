# ADR-0024: Tournament placement awards replace match Elo

- **Status:** Accepted
- **Date:** 2026-07-11
- **Supersedes:** the tournament-scoring consequence in ADR-0016

## Context

Applying Elo after every short tournament match overweights one event and leaves
the ladder at 1045/1016/984/955. The qualifier instead awards its official
placements: 100, 50, 20, and 10 points. Both round-robin and final-stage
completion now provide stable derived placements.

## Decision

Tournament-linked matches remain immutable approved facts and appear in
tournament/profile history, but never enter Elo, ranked W-L, rating history, or
reign calculation as match events. On completion, materialise one derived
placement per player with fixed 100/50/20/10 awards. The ladder is non-tournament
Elo plus cumulative placement awards; a player with no ordinary ranked match
starts from the internal 1000 baseline when receiving their first award.

Result emails are manual and idempotent. Each player receives their placement,
award, and a chronological recap of every tournament match they played. The same
placement derivation supports standings completion and final-stage completion.

## Consequences

- Rebuilding the rating cache corrects previously applied tournament Elo.
- Played tournament matches still exist without pretending they are ordinary
  ladder matches.
- Placement rows are rebuildable materialisations, not manually entered facts.
- Future tournaments accumulate awards on top of existing ladder points.
