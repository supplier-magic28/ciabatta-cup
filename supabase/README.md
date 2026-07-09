# Supabase

Database migrations for Ciabatta Cup. The authoritative data model is
`docs/SCHEMA.md`; migrations are built in phases (ADR-0003).

## Migrations

`migrations/` holds ordered SQL files applied in filename order.

- `20260709000000_players_spine.sql` — **Phase 2 spine**: the `players` table,
  the `is_admin()` helper, RLS policies, and a privilege-escalation guard.
- `20260709010000_handle_new_user.sql` — **Phase 2 auth**: `handle_new_user()`
  trigger that auto-creates a `players` profile on signup, plus a widening of the
  privilege guard to allow self `invited → active` (ADR-0004).
- `20260709020000_guard_exempt_backend.sql` — exempt trusted backend contexts
  (service role / SQL editor, where `auth.uid()` is null) from the privilege
  guard, so the first admin can be seeded with a plain `update` (ADR-0005).
- `20260710000000_matches_spine.sql` — **Phase 3a spine**: the `matches`,
  `match_sets`, and `match_confirmations` tables, their RLS policies, and the
  immutable-facts triggers that seal a match (and its sets/confirmations) once it
  is approved (ADR-0001, ADR-0006). `tournament_id`/`fixture_id` are nullable
  plain-uuid columns until those tables land.

The `players` and match tables exist so far. Tournaments, fixtures, rating
history, etc. arrive in later phases.

## Applying migrations

Both migrations must be applied for auth to work. Either:

- **Supabase CLI:** `supabase db push` (requires `supabase link` to the project).
- **Dashboard:** paste each file's SQL into the SQL Editor and run them in order.

## Email confirmation setting

Signup works with email confirmation on **or** off:

- **Off** (Dashboard → Authentication → Providers → Email → disable "Confirm
  email"): `signUp` returns a session immediately and the user lands logged in.
  Simplest for this private app.
- **On:** the user gets a link that hits `/auth/confirm`, which verifies the OTP
  and then signs them in.

## Create your first admin (out-of-band, per ADR-0002 / ADR-0005)

RLS lets only admins manage `players`, so the first admin is seeded by hand.
With all migrations applied (including `20260709020000_guard_exempt_backend.sql`,
which lets the SQL editor past the privilege guard — see ADR-0005):

1. **Apply all migrations** (above).
2. **Sign up through the app** with your email at `/sign-up`. The trigger creates
   your `players` row automatically (as a regular `player`).
3. **Promote yourself to admin** in the Dashboard SQL Editor:

   ```sql
   update public.players
   set role = 'admin', status = 'active'
   where email = 'ringo@spectoolbox.com';
   ```

That is it — you are now the tournament director and can manage everyone else.

_(Alternative without signing up first: create the auth user in
Dashboard → Authentication → Add user, then `insert` the `players` row with
`role = 'admin'` using that user's id.)_

> **If you have not yet applied `20260709020000`** and are blocked by the guard,
> either apply it now, or do a one-off with the trigger disabled:
>
> ```sql
> begin;
> alter table public.players disable trigger enforce_player_self_update;
> update public.players set role='admin', status='active'
> where email='ringo@spectoolbox.com';
> alter table public.players enable trigger enforce_player_self_update;
> commit;
> ```
