# ADR-0027: Owner deletion of external test matches

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

The Non-Ciabatta workflow approves immediately, so an owner needs a safe way to
remove a test or mistaken result before announcing the feature. The general
immutable-facts rule must continue protecting competitive league history.

## Decision

Permit authenticated owners to delete only `unranked_external` matches they
submitted. A dedicated security-definer RPC removes the derived history and
the external fact atomically. The application then rebuilds ratings from all
remaining facts. Ranked, exhibition, and tournament matches remain immutable.

## Consequences

- Test external results and their +10 points can be cleanly removed.
- Users cannot delete another player's external match.
- Competitive facts retain the original append-only correction policy.
