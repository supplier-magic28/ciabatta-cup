# ADR-0034: Audited admin match entry and one public points projection

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

Organisers need to enter trusted results without impersonating participant
confirmation. The ladder and player profile also recomputed activity points
from different, RLS-limited fact sets, so the same player could show different
totals on the two routes.

## Decision

An admin-only RPC records any two active members, their score, and the acting
organiser atomically, then seals the match as approved without confirmation or
approval work. Public standings and point timelines come from one server-only,
service-role fact loader feeding the pure activity-points replay with an
explicit Melbourne as-of date. Routes receive derived output, never private
practice notes, manual-mark detail, or external opponent names.

Leaderboard and profile career summaries share one aggregate projection.
Approved exhibitions are the public non-ranked record; aggregate Non-Ciabatta
W-L is public while its opponent identities remain owner-private.

## Consequences

- Admin-entered facts are immediately immutable and attributable.
- Participant notifications report the organiser-entered result but request no action.
- Current points, rank, and historical movement cannot vary by viewer RLS.
- Ordinary Elo remains a separate derived input for seeding and analysis.
