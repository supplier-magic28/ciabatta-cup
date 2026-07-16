# ADR-0014: Unranked players display zero points

- **Status:** Accepted (refines ADR-0007, ADR-0011, and ADR-0012)
- **Date:** 2026-07-10
- **Superseded by:** ADR-0025 (baseline and floor only)

## Context

The original Elo policy seeded every rostered player at 1000 public points.
That is a useful mathematical baseline, but it makes a newly joined player look
as though they have earned a ladder rating before completing a ranked match. It
also allows an idle roster to display a number-one row despite correctly having
no Ciabatta holder.

Starting the Elo calculation itself at zero would distort the established
formula and floor: the first equal match should still produce the conventional
1016/984 result under K=32.

## Decision

Zero is the public and cached value for an unranked player. A player becomes
ranked after participating in their first approved ranked match. At that moment,
their Elo calculation begins from the existing internal `START_RATING = 1000`
baseline and the result publishes their earned rating.

Unranked players sort after every ranked player, display no numeric rank, and
cannot be presented as the current Ciabatta holder. Exhibition, pending,
queried, and rejected matches do not confer a rating.

`players.rating_points` defaults to zero. Full cache rebuilds reset all players
to zero before applying the computed payload, and the migration backfills
players with no approved ranked result.

## Consequences

- Joining the app no longer awards visible ladder points or a rank.
- Both participants earn a rating by completing a ranked match; losing the
  first match still produces a meaningful Elo rating rather than zero.
- Rating history remains a chain of values at or above the existing 100-point
  floor because it records only ranked participants, never the unrated zero.
- The pure engine retains its tested 1000 baseline and can still be rebuilt
  from immutable match facts without migrating authoritative history.
