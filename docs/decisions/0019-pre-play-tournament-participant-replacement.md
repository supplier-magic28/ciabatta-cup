# ADR-0019: Pre-play tournament participant replacement

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

The Ciabatta Qualifier is configured before play, but a player may become
unavailable after the draw has been created. The organiser needs to substitute
an active player without manually editing several participant and fixture rows.
Approved matches remain immutable, so a replacement must never be available once
the tournament has a result.

## Decision

Add one admin-console action that replaces an existing participant only while
the tournament is `draft` or `scheduled` and has no matches. The replacement
must be an active player who is not already in the field. The outgoing player's
seed is preserved, all pre-play fixtures are cleared, and the deterministic
round-robin generator writes a fresh draw. The existing database participant
lock remains the final enforcement boundary after the first result.

## Consequences

- Organisers have one clear field-change workflow instead of separate remove and
  add operations that could temporarily create an invalid four-player draw.
- The replacement cannot silently alter standings, Elo, or approved facts.
- The first release still requires exactly four players; mid-event withdrawals,
  partial fields, and append-only result corrections remain deferred.
