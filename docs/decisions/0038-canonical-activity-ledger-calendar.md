# ADR-0038: Canonical activity ledger for personal calendar

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

Leaderboard totals, profile history, cache rebuilds, and a personal calendar all
need to explain the same awards and Melbourne-day decay. Recomputing point
values inside a calendar model would create a second scoring implementation.

## Decision

`computeActivityPoints()` remains the sole activity-points engine and emits a
source-aware per-player ledger beside current points and daily timelines. Its
entries identify ranked participation/win, exhibition, Non-Ciabatta, practice,
placement, and daily/seven-day/thirty-day decay. Daily timelines record the
movement actually applied after the zero floor.

`loadPublicLadderProjection()` exposes that ledger for an explicit Melbourne
date and deduplicates matching loads within a server request. Leaderboard,
profiles, points history, cache rebuild, and `/calendar` consume this projection.
Calendar code may slice the ledger but must not import scoring constants or
write another total. Persisted ratings remain rebuildable snapshots.

## Consequences

- The calendar explains the public total rather than calculating another one.
- Range and visibility controls never change canonical current points or rank.
- Cup fixtures form one calendar event and do not receive ordinary awards;
  placement awards remain keyed to the cup.
- No schema, scheduled writer, or duplicate per-profile score column is added.
