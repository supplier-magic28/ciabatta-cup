# ADR-0045: Guarded pre-play tournament draw unlock

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** ADR-0022 and ADR-0039 for the irreversible draw-lock scope only

## Context

The draw lock originally made every cup configuration choice permanent. That
kept results safe, but it left the director without a recovery path when a
player withdrew after the draw was announced and before anyone played. The
existing roster and draw RPCs already support atomic replacement while a cup is
unlocked, and match facts provide an unambiguous boundary after which changing
the field would rewrite sporting history.

## Decision

An active organiser may unlock a locked `scheduled` cup only when it has no
match, placement, or completion facts. The row-locking
`unlock_tournament_draw_v1` RPC clears `draw_locked_at`, returns the cup to
`draft`, and leaves the current fixtures visible as a preview until an existing
roster/draw RPC replaces them atomically. The schedule lock remains independent.

The first recorded result is the permanent boundary. Neither the application
nor a direct authenticated table update can unlock after that point. Lock and
unlock retries are idempotent, and existing recipient-stable locked-in email
receipts are preserved rather than resent.

## Consequences

Last-minute withdrawals can be handled without deleting or bypassing the cup.
The director must lock the revised field again before recording play. Players
who already received a locked-in message are not emailed twice; a newly added
player receives a new recipient-specific intent on relock. If details change
for existing recipients, the organiser must communicate that correction
separately because delivered email receipts remain immutable.

## Release verification addendum (2026-07-20)

The application eligibility check must use the existence of any tournament
match row, not only approved-result counts, so the visible recovery path mirrors
the RPC boundary. The database contract builds participants and group fixtures
before setting the draw lock; otherwise the established participant-lock guard
aborts fixture setup and leaves the unlock RPC untested. Release verification
therefore proves preservation and retry behavior as well as ordinary-player,
direct-write, match-row, and placement refusal.
