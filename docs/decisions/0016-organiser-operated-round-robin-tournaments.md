# ADR-0016: Organiser-operated round-robin tournaments

- **Status:** Accepted
- **Date:** 2026-07-10
- **Superseded by:** ADR-0024 (tournament-scoring consequence only)

## Context

The first Ciabatta Qualifier needs to run four players across two courts with a
three-round draw, an optional qualification decider, a final, and a third-place
match. Tournament scheduling changes as an event progresses, but ADR-0001 makes
approved match scores immutable facts. The event also needs fast court-side
entry; requiring player confirmation and a second admin approval for every
fixture would add ceremony without adding useful trust for this small group.

## Decision

Tournaments, participants, and fixtures are operational scheduling entities.
Authenticated players may read them and admins manage them. A deterministic
pure circle-method generator creates the round-robin draw from seed order.
Standings, progress, and the champion are derived from approved matches linked
through `matches.fixture_id`; fixtures do not duplicate match status or winners.

The tournament director records a fixture through an admin-only transactional
RPC. It inserts the match unsealed, adds its set, and then approves it in one
transaction. `submitted_by` identifies either a player submitter or an admin
recorder; player-submitted matches remain participant-only through RLS.

Round-robin standings order wins, game difference, head-to-head, then seed. A
tie on wins crossing second and third creates a first-to-three decider. The
qualifier's group and decider fixtures are first to three games; its final and
third-place match are full sets with a tie-break at 6-6. Every fixture is ranked
and affects Elo normally. Placement rewards are not a second points system.

## Consequences

- The first event can be set up, scored, advanced, and completed from one admin
  console while players follow a live read-only board.
- Tournament results preserve the immutable-fact and full Elo-rebuild policies.
- Admin score entry needs a deliberate review step because an approved typo
  cannot be edited; a future append-only correction model requires another ADR.
- The first UI supports exactly four-player round robin. The pure generator
  already supports odd fields and rests, leaving a tested seam for expansion.
- Knockout structures, self-entry, mid-event withdrawals, and placement points
  remain future product decisions.
