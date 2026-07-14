# ADR-0040: Ordinary cups own trophies and RSVP invitations

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

Each cup is an ordinary competition with its own collectible identity. Players
need email and in-app invitations, but accepting one must not bypass the
organiser's authority over the final field.

## Decision

Optional trophy identity belongs to the tournament, not to a tournament type.
Invitation responses are stored separately from the ordered participant roster.
An accepted invitation is an RSVP; the organiser still chooses the roster and
the existing permanent draw lock alone confirms the final field and rules.

Email is the external prompt and Zeus is the in-app notification. Native push
subscriptions remain out of scope.

## Consequences

- Trophy awards remain derived from official first-place placement facts.
- Over-inviting is safe because responses do not consume or reserve seats.
- RSVP records survive all permitted pre-lock roster, seat, and format edits.
- Future cup trophies can reuse the identity seam without new competition types.
