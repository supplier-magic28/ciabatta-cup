# ADR-0048: Director final inherits the cup's group format

- **Status:** Accepted
- **Date:** 2026-07-22
- **Supersedes:** ADR-0046 for the override-final ruleset only

## Context

The Claymore director described its exceptional final as “best of 3,” meaning
one short set won by the first player to three games, matching every group
match. The implementation interpreted that phrase as best of three full
standard sets and installed `best_of_3_standard`. The audited finalist choice
and skipped decider were correct, but the unplayed final's format was not.

The incorrect fixture had already been installed in production. It had no match
row, so changing only its ruleset does not alter a sporting fact.

## Decision

An audited director override final inherits the tournament's locked
`group_ruleset`. For Claymore this is `short_first_to_3`. The forward-only
migration repairs an existing override final only when its ruleset is the
mistaken `best_of_3_standard`, it has no match row, its pairing and every other
fixture field remain unchanged, and its replacement equals the cup's locked
group ruleset.

The stable override RPC creates future finals with `group_ruleset` and an exact
retry repairs the same pre-result legacy state. Once any final match row exists,
the correction path is closed.

## Consequences

Claymore's final uses the same single score entry and validation contract as its
round robin. The correction cannot rewrite players, scheduling, scores, or an
already-started final. The override audit and final-derived placements are
unchanged.
