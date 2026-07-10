# ADR-0015: Hard-delete only players without match history

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

Admins need to remove accidental, test, and abandoned invited accounts from the
small private roster. Deleting a player who appears in a match would conflict
with ADR-0001: match facts are immutable and their participant identities must
remain resolvable. The `matches` foreign keys already use `on delete restrict`,
but relying on a raw database error would make the admin workflow unclear.

Supabase Auth owns identity, while `public.players` is a cascading profile. A
complete deletion must therefore begin through the Auth admin API rather than
removing only the profile row.

## Decision

An authenticated admin may permanently delete another player only when no match
row references that player as participant, winner, or submitter. The Server
Action rechecks the actor's admin role, validates the target id, blocks
self-deletion, loads the target, and performs the match-reference check before
calling the service-role `auth.admin.deleteUser` API.

Deleting the Auth identity cascades to the unused `players` profile. Players
with any match history are refused with an instruction to deactivate them
instead; database foreign keys remain the final integrity backstop.

## Consequences

- Test and unaccepted invite accounts can be cleaned out completely.
- Match facts, rating history, reigns, and profile links cannot be orphaned by
  an admin roster action.
- The operation requires `SUPABASE_SECRET_KEY` and is unavailable to players.
- Deactivation remains the correct lifecycle for historical players and is a
  separate manage-player feature.
