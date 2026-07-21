# ADR-0047: Extend the director final override to standings cups

- **Status:** Accepted
- **Date:** 2026-07-22
- **Supersedes:** ADR-0046 for the configured championship-path restriction only

## Context

ADR-0046 limited the audited four-player escape hatch to `top_two_final` cups.
The live Claymore event was instead configured with the `standings` path, so
its three-way group tie correctly produced a first-place decider. The director
still needed the same fact-preserving outcome: nominate two finalists for a
real best-of-three match, retain the group table for third/fourth, and never
invent a decider result.

The first application release therefore hid the override even though every
other safety precondition held. It also needed to ensure that, after installing
the final, the skipped decider no longer controlled the admin progression
label.

## Decision

The existing `override_tournament_final_v1(uuid,uuid,uuid,text)` contract also
accepts a locked four-player `standings` cup. All other ADR-0046 boundaries stay
unchanged: six approved group results, only an unplayed decider outside the
group stage, no placements or championship match, two roster finalists, a
durable reason, preserved fixtures, and one immutable override decision.

The original `championship_path` remains an event configuration fact. The
override row records the exceptional transition, and `completion_path` becomes
`final_stage` only after the selected final is approved and the atomic
finalizer commits placements. Admin progression prioritizes an installed final
over its preserved skipped decider.

## Consequences

Claymore and future four-player standings cups can use the same audited recovery
without rewriting their configured format or sporting results. Top-four cups
remain outside this narrow escape hatch. A forward-only migration replaces the
RPC because the original production migration is already applied.
