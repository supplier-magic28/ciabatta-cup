# ADR-0005: The player privilege guard exempts trusted backend contexts

- **Status:** Accepted (corrects a bootstrap assumption in ADR-0002)
- **Date:** 2026-07-09
- **Supersedes:** ADR-0002 (bootstrap mechanism only)

## Context

ADR-0002 said the first admin is seeded out-of-band "via the service role / SQL
editor, which bypasses RLS." In practice, promoting the first admin with
`update players set role='admin' …` in the SQL editor failed with:

> only admins may change id, email, role, rating_points, or invited_at

The reason: `enforce_player_self_update()` is a **trigger**, not an RLS policy.
The service role and the SQL editor's `postgres` role bypass **RLS policies**,
but triggers still fire. In those backend contexts there is no end-user JWT, so
`auth.uid()` is `null` and `is_admin()` returns false — so the guard blocked the
exact bootstrap ADR-0002 relied on. ADR-0002's "bypasses RLS" was true but
insufficient; it overlooked the trigger.

## Decision

The guard is meant to constrain **end-user players**, not trusted backend
tooling. Update `enforce_player_self_update()` to exempt any context with no
end-user JWT — i.e. `auth.uid() is null` (service role, postgres, SQL editor) —
in addition to admins:

```sql
if public.is_admin() or auth.uid() is null then
  return new;
end if;
```

Delivered as migration `20260709020000_guard_exempt_backend.sql`.

## Consequences

- The first admin is seeded with a plain `update … set role='admin'` from the
  SQL editor — no trigger disabling required. `supabase/README.md` is simplified
  accordingly.
- Security is unchanged for end users: an authenticated request always carries a
  uid, so players are still frozen out of `role`/`rating_points`/etc., and are
  still limited to the `invited → active` self transition. Anon requests cannot
  pass RLS to reach the trigger at all.
- Trusted backend paths (service-role jobs, future admin tooling run out-of-band)
  can manage players without fighting the guard.
- This ADR supersedes ADR-0002's bootstrap mechanism note; ADR-0002's core
  decision (Supabase Auth, `players.id` → `auth.users.id`) is unchanged.
