# ADR-0030: Planned match shells and Zeus notifications

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Players need to coordinate upcoming matches without creating immutable result facts before a score and stakes exist. The existing ranked workflow also requires organiser review after both players agree.

## Decision

Upcoming matches are stored separately from immutable result facts. A planned shell carries only participants, time, place, and lifecycle state; stakes and scores are decided after play. Internal unranked results finalise after both players agree, ranked results additionally enter the existing admin approval flow, and owner-private external results retain their immediate lifecycle.

Zeus notifications are owner-private, navigation-only inbox cards. They never accept or approve a match directly.

## Consequences

- Planned rows remain editable/cancellable shells until a result is finalised.
- Public calendar visibility does not expose private notification content.
- Ranked planned results retain the established organiser approval safeguard.
