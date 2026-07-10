# ADR-0018: Password recovery workflow

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

The application supported password sign-in and invitation password setup, but
it did not provide a recovery path for an existing player who had forgotten a
password or never completed setup. Supabase recovery links establish a session
through a callback before the password can be replaced.

## Decision

Add `/forgot-password` to request a Supabase recovery email and route its
server-side token callback through `/auth/confirm?next=/update-password`. Add
`/update-password` with matching-password validation and a server-side
`auth.updateUser` call. Invited profiles are activated only after the password
update succeeds. Recovery responses do not reveal whether an email exists.

## Consequences

Players have a self-service recovery workflow without exposing the service key
or storing password data in the application database. Supabase Auth URL
allow-lists and the Password recovery email template must include the callback
origin and pass `token_hash` plus `type=recovery` to it. Password reset remains
conservative: no local profile or league state changes until Supabase confirms
the password update.
