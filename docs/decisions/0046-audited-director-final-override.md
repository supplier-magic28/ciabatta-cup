# ADR-0046: Audited director-seeded cup final

- **Status:** Accepted
- **Date:** 2026-07-22
- **Supersedes:** ADR-0016 and ADR-0023 for the mandatory qualification-decider scope only
- **Superseded by:** ADR-0047 for the configured championship-path restriction; ADR-0048 for the override-final ruleset

## Context

A three-way tie on group wins can trigger the configured qualification decider
even when the director has a legitimate event-specific reason to nominate a
different pair of finalists. Recording a fake decider score would corrupt the
immutable sporting ledger, while direct fixture or placement edits would evade
the atomic tournament boundaries.

## Decision

An active organiser may record one audited final override for a locked,
four-player `top_two_final` cup after all six group fixtures are approved and
before any championship-stage match exists. The organiser selects two distinct
roster finalists and records a 10-500 character reason. The row-locking RPC
preserves every group fixture and match, marks the unplayed qualification
decider as skipped, and installs one `best_of_3_standard` final.

The override is retry-stable and cannot be changed. Once championship scoring
starts, the override closes. First and second are derived from the approved
final; the two non-finalists retain their canonical group-table order as third
and fourth. `finalize_tournament_v1` validates that complete ordering before it
atomically commits placements and result-email intents.

## Consequences

Directors can handle an exceptional tournament format without manufacturing a
match or rewriting a group result. The admin console makes the permanence and
third/fourth ordering explicit. This escape hatch is intentionally limited to
four-player top-two-final cups; broader manual brackets need a separate model.
