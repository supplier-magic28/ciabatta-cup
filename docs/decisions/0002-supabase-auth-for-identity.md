# ADR-0002: Supabase Auth for identity; no self-managed passwords

- **Status:** Accepted
- **Date:** 2026-07-09
- **Superseded by:** ADR-0005 (bootstrap mechanism only)

## Context

The design handoff `SCHEMA.md` specified a `players.password_hash` column and
"email + password" auth. Our stack already includes Supabase, which ships Auth
(`auth.users`) with email/password, invite links, session management, and
security we should not reimplement. Rolling our own password storage would be
strictly worse: more code, more risk, no benefit for a ~10-user app.

The one wrinkle: `players.status = invited` means "signup link sent, not yet
registered", which implies a `players` row before the person has an account.

## Decision

Identity is owned by **Supabase Auth**. Specifically:

- **Drop `password_hash`** from `players`. Passwords are never stored in our
  schema.
- **`players.id` is a foreign key to `auth.users.id`** (`on delete cascade`). A
  `players` row is the app-level *profile* attached to an auth user.
- `players.email` mirrors the auth email (login identifier / display), but the
  credential lives in Supabase Auth.
- **Invited players** are created with Supabase Auth's invite flow
  (`inviteUserByEmail`), which creates the `auth.users` row at invite time and
  sends a tokenised link. So the FK holds even in `invited` state; `status` goes
  `invited → active` when they register.

## Consequences

- No password handling, reset flows, or hashing code to own or audit.
- Row-level security keys off `auth.uid()` directly, since it equals `players.id`.
- **Bootstrap:** the first admin cannot be created through RLS (no admin exists
  to authorise it). It is seeded out-of-band — insert the `auth.users` row
  (dashboard/invite) then the `players` row with `role='admin'` via the service
  role / SQL editor, which bypasses RLS. Documented in `supabase/README.md`.
- A later phase may add an `auth.users` → `players` trigger to auto-create
  profiles on signup; for now rows are created by the invite flow / admin.
