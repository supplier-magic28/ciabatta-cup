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

Only the `players` table exists so far. Matches, tournaments, fixtures, rating
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

## Create your first admin (out-of-band, per ADR-0002)

RLS lets only admins manage `players`, so the first admin is seeded by hand.
With the `handle_new_user` trigger applied, the easiest path is:

1. **Apply both migrations** (above).
2. **Sign up through the app** with your email at `/sign-up`. The trigger creates
   your `players` row automatically (as a regular `player`).
3. **Promote yourself to admin** in the Dashboard SQL Editor (service role
   bypasses RLS):

   ```sql
   update public.players
   set role = 'admin', status = 'active'
   where email = 'ringo@spectoolbox.com';
   ```

That is it — you are now the tournament director and can manage everyone else.

_(Alternative without signing up first: create the auth user in
Dashboard → Authentication → Add user, then `insert` the `players` row with
`role = 'admin'` using that user's id.)_
