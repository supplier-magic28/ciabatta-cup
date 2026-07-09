# ADR-0004: Auth implementation — self-service signup, profile trigger, activation

- **Status:** Accepted (builds on ADR-0002)
- **Date:** 2026-07-09

## Context

ADR-0002 chose Supabase Auth and made `players.id` a FK to `auth.users.id`.
Implementing sign-up / log-in raised three concrete questions the spine did not
settle:

1. **Where does the profile row come from on signup?** The `players` row must be
   created for every new auth user, and not from client code (untrusted, easy to
   skip).
2. **How do `first_name` / `last_name` get set?** They are `NOT NULL`, but a
   trigger on `auth.users` only sees `id` + `email`.
3. **How does `invited → active` happen** when the Phase 2 privilege trigger
   blocks non-admins from changing `status`?

## Decision

- **Profile auto-creation via a DB trigger.** `handle_new_user()`
  (`SECURITY DEFINER`) runs `after insert on auth.users` and inserts the matching
  `public.players` row. Client code never creates profiles. `on conflict (id) do
  nothing` protects a pre-existing invited row.
- **Name travels as signup metadata.** The create-account form collects first/
  last name and passes them via `signUp({ options: { data } })`; the trigger
  reads them from `raw_user_meta_data` (empty-string fallback keeps the NOT NULL
  constraint safe).
- **Self-service signups are created `active`.** The trigger sets
  `status = 'active'`, `joined_at = now()` for the normal signup path.
- **Invited users self-activate.** The Phase 2 `enforce_player_self_update`
  trigger is widened (in the same migration) to allow exactly the one-way self
  transition `status: invited → active`; `role`, `rating_points`, `id`, `email`,
  and `invited_at` stay frozen for non-admins. `getSessionPlayer()` performs this
  flip on first authenticated entry.
- **Sessions via proxy.** `proxy.ts` (Next 16's renamed middleware convention)
  refreshes the Supabase session on every request and enforces the protected-
  route pattern (unauthenticated → `/sign-in`).
- **Email confirmation supported but optional.** `/auth/confirm` verifies the
  OTP if email confirmation is enabled; the app also works with it disabled.

## Consequences

- Every auth user has a profile row without any client-side write.
- A non-admin still cannot escalate role or edit points — the only status change
  they can make is completing their own signup.
- If the `handle_new_user` migration is not applied, `getSessionPlayer()` falls
  back to a minimal profile so the app degrades gracefully rather than crashing.
- Password reset / admin invite UI remain out of scope for this phase.
