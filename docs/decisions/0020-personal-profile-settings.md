# ADR-0020: Personal profile settings and public display identity

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

Players need to make the Cup feel like their own without changing the account
identity used by Supabase Auth or the immutable match facts. The existing
profile row already has nickname and avatar URL fields, but there is no
self-service editor, nickname preference, or protected avatar storage path.

## Decision

Add a self-owned `/profile` settings flow for nickname, nickname visibility, and
avatar management. `use_nickname` defaults to false; when enabled and a nickname
exists, the shared display-name helper uses it on player-facing leaderboard,
match, tournament, and public-profile surfaces. Nicknames may repeat because
they are labels rather than identities.

Avatars are stored in a public Supabase Storage bucket under a player-owned
folder. The browser performs a circular crop and sends a 512px WebP to a
server-authorized action. Storage policies restrict writes and deletion to the
matching authenticated folder, while public reads support existing avatar
renders.

## Consequences

- Players control their presentation without changing legal/account identity,
  role, status, ratings, or match history.
- All name surfaces must read the nickname preference through the shared helper;
  raw first/last name formatting is no longer sufficient for player labels.
- Circular crop output is predictable across portrait, landscape, and square
  source images, with the existing avatar component remaining the renderer.
- Future privacy controls or richer profile fields require a separate decision.
