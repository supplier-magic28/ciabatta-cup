# ADR-0028: Derived Melbourne tennis streaks

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

Players want a tennis-activity streak that includes league, tournament,
external, and informal play without making another derived cache authoritative.
Calendar boundaries and an unplayed current day need deterministic rules.

## Decision

Derive played days from every participating match except rejected submissions,
unioned with owner-only manual `play_days` marks. Convert instants using
`Australia/Melbourne`. Manual marks may only be added or removed for Melbourne
today. A current streak may end yesterday, so it breaks only after a complete
missed day. Best streak scans all available played days.

H2H and result history remain approved-fact projections and use the shared
five-match gate; no streak or H2H aggregate is persisted.

## Consequences

- Pending and queried matches acknowledge that tennis was played immediately.
- Rejected submissions never produce streak credit.
- Travelling users see the league's Melbourne calendar consistently.
- Every statistic can be rebuilt from match facts and manual marks.
