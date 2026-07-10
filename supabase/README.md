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
- `20260710010000_invited_profile_status.sql` — redefine `handle_new_user` so an
  **invited** auth user (`invited_at` set) gets a `players` row at status
  `invited`, while self-signups stay `active` (ADR-0009). Supersedes the
  profile-status logic in `20260709010000`.
- `20260710020000_advance_on_confirmation.sql` documents the confirmation
  trigger: ranked results await admin approval and exhibitions are approved
  automatically (ADR-0010).
- `20260710030000_rating_cache.sql` adds the rebuildable `rating_history`
  materialisation and the service-role-only cache replacement RPC that refreshes
  `players.rating_points` (ADR-0011).
- `20260710040000_ciabatta_reigns.sql` adds the rebuildable holder-history cache
  and a compatible three-payload replacement RPC that refreshes ratings,
  history, and reigns together (ADR-0012).
- `20260710050000_fix_invited_profile_status_cast.sql` fixes Auth invite
  creation by explicitly casting the `handle_new_user()` status branch to the
  `player_status` enum.
- `20260710060000_unranked_players_zero_points.sql` changes the public/cache
  default to zero until a player's first approved ranked match and backfills
  existing unranked players (ADR-0014).
- `20260710070000_tournament_day_release.sql` adds tournaments, ordered
  participants, fixtures, authenticated-read/admin-write RLS, the deferred match
  foreign keys, and the admin-only atomic tournament-result RPC (ADR-0016).

The player, match, confirmation, rating-history, reign, tournament, participant,
and fixture tables exist in migration form. Activity remains a later phase.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe
  client config.
- `SUPABASE_SECRET_KEY` — **server-only** service-role key. Required for player
  invites, safe deletion of unused identities, and rebuilding derived ratings
  after ranked or tournament approval. Never expose it to the browser or commit
  it; `.env*` is git-ignored.
- `NEXT_PUBLIC_SITE_URL` — canonical invite origin. Set it to
  `https://ciabatta-cup.app` in production.

## Inviting players (Supabase project config)

Admin invites call `inviteUserByEmail` with a `redirectTo` of
`<site>/auth/confirm?next=/`. For the link to work end-to-end, in the Supabase
dashboard:

1. **Authentication -> URL Configuration:** set the Site URL to
   `https://ciabatta-cup.app`; allow
   `https://ciabatta-cup.app/auth/confirm?next=%2F` and the corresponding local
   URL for development.
2. **Authentication -> SMTP Settings:** configure the verified
   `ciabatta-cup.app` sender and disable provider click tracking for Auth links.
3. **Authentication -> Email Templates -> Invite user:** use
   `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>`.
   `/auth/confirm` verifies that OTP and sends invitees to `/accept-invite`.
   Their password submission then flips the profile from `invited` to `active`.

## Applying migrations

Apply migrations in filename order. Either:

- **Supabase CLI:** `supabase db push` (requires `supabase link` to the project).
- **Dashboard:** paste each file's SQL into the SQL Editor and run them in order.

## Password recovery

The app requests recovery mail from `/forgot-password` and sends users through
`/auth/confirm?next=%2Fupdate-password` before rendering the password form.
Allow both the production and local callback URLs in **Authentication -> URL
Configuration**:

```text
https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password
http://localhost:3000/auth/confirm?next=%2Fupdate-password
```

In the **Password recovery** email template, replace the default link with the
server-side callback link:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">
  Set a new Ciabatta Cup password
</a>
```

The callback verifies the recovery token on the server, then shows the
two-field password form. The form updates the Supabase Auth password and
activates an invited profile only after the update succeeds. Do not use the
default `{{ .ConfirmationURL }}` fragment link with this SSR callback.

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
