# ADR-0026: Private external opponents and rebuildable flat awards

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

Players want credit for matches against people outside the league. Opponent
names belong only to the submitting player's personal history, while ladder
points must survive whole-cache rebuilds.

## Decision

Store saved names and per-match names in owner-RLS tables separate from the
public immutable `unranked_external` match row. Create the fact and score
atomically, then approve it immediately. Derive a flat +10 award for every
approved external fact in `buildRatingCache`; exclude those facts from Elo,
ranked records, streaks, form, and movement.

## Consequences

- Direct database reads cannot expose private opponent names.
- Rating rebuilds are idempotent and cannot lose external awards.
- Shared surfaces use “Non-Ciabatta opponent”.
- Corrections follow the existing append-only approved-match policy.
