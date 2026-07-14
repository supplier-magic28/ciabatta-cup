# ADR-0035: Activity-ladder Ciabatta reigns

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

The public leaderboard moved from ordinary-match Elo to the canonical activity-
points projection, but Ciabatta ownership still replayed the old Elo leader and
used the time tournament placement rows happened to be written. The displayed
holder and held duration could therefore disagree with the visible #1 player
and the date they actually reached the top.

## Decision

Ciabatta ownership is derived from the same chronological Melbourne-day
activity-point timeline as the public leaderboard. The first positive leader
starts the first reign. The incumbent retains the title while tied and loses it
only when another player has a strictly higher total. Equal-point leaderboard
ordering keeps that incumbent first.

Tournament placement awards enter the replay on the tournament `starts_at`
date, including legacy placement rows created later. Held duration is the
number of Melbourne calendar boundaries since the reign began.

## Consequences

- The holder, #1 row, points total, and player profile now share one projection.
- Ties cannot create arbitrary title changes due to player-id sorting.
- Rebuilding the derived cache corrects historical reign boundaries without
  changing match or placement facts.
- Reigns have day precision because the public activity engine aggregates facts
  by Melbourne date.
