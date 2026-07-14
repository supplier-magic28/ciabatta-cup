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
  history, and reigns together (ADR-0012). ADR-0035 later defines those rows as
  the canonical Melbourne-day activity-ladder lead, with incumbent retention
  on ties.
- `20260710050000_fix_invited_profile_status_cast.sql` fixes Auth invite
  creation by explicitly casting the `handle_new_user()` status branch to the
  `player_status` enum.
- `20260710060000_unranked_players_zero_points.sql` changes the public/cache
  default to zero until a player's first approved ranked match and backfills
  existing unranked players (ADR-0014).
- `20260710070000_tournament_day_release.sql` adds tournaments, ordered
  participants, fixtures, authenticated-read/admin-write RLS, the deferred match
  foreign keys, and the admin-only atomic tournament-result RPC (ADR-0016).
- `20260710090000_profile_settings_and_avatars.sql` adds the self-owned
  `use_nickname` preference, the public `avatars` bucket, and owner-only Storage
  write/delete policies (ADR-0020).
- `20260710100000_tournament_cover_photos.sql` adds the optional tournament
  cover URL and the admin-managed public `tournament-images` Storage bucket
  (ADR-0021).
- `20260710110000_tournament_draw_lock_and_emails.sql` adds the irreversible
  draw lock, database-enforced field/draw freezing, and the idempotent
  lifecycle-email delivery ledger (ADR-0022).
- `20260710120000_optional_round_robin_completion.sql` adds the explicit
  completion path, preserved skipped fixtures, and the atomic admin-only
  round-robin completion RPC (ADR-0023).
- `20260710130000_tournament_placement_awards.sql` adds derived placement
  awards and the four idempotent result-email delivery kinds (ADR-0024).
- `20260710140000_safe_rating_cache_rebuild.sql` makes the intentional
  full-table rating-history and reign-cache replacements explicit with
  `where true`, satisfying production safe-update enforcement.

- `20260712090000_external_match_type.sql` adds the external match enum value in
  its own transaction so subsequent schema changes can use it safely.
- `20260712100000_non_ciabatta_opponents.sql` adds owner-private saved names
  and match details, external match facts, and the atomic authenticated logging
  RPC used for immediate approval. It also adds optional match location storage;
  played date remains compulsory through the existing non-null `played_at` fact.
- `20260712110000_delete_own_external_matches.sql` permits authenticated owners
  to delete only their own Non-Ciabatta facts; all league and tournament facts
  remain immutable, and the app rebuilds derived ratings afterward.
- `20260712120000_profile_play_days.sql` adds owner-only, Melbourne-today-only
  manual tennis-day marks. Match-derived play days and all streak statistics
  remain computed rather than stored.
- `20260715120000_courts_surfaces_zeus_inbox.sql` adds shared canonical courts,
  optional per-match surfaces, structured court links across planned matches
  and tournaments, metadata-only retro tagging/audit, organiser merges, and
  general Zeus notification destinations (ADR-0031).
- `20260715121000_seed_untagged_notifications.sql` runs after the enum change
  and must be followed by `20260715122000_reliable_realtime_notifications.sql`
  for transactional planned-match fan-out and receiver-live badge updates.
  commits and seeds one Zeus nudge for players with historical untagged facts.
- `20260716120000_match_workflow_repair_types.sql` commits the correction and
  complete notification enum values plus proposal-revision/match-link columns.
- `20260716121000_atomic_match_workflows.sql` must follow it. It installs the
  authenticated row-locking planned/ordinary workflow RPCs, complete receiver
  fan-out, and idempotent backfill for currently actionable work (ADR-0033).
- `20260718120000_core_backend_hardening.sql` is the additive ADR-0036 rollout:
  shared score validation, idempotent creation keys, RPC lifecycle boundaries,
  scoring-fact versioning, guarded cache replacement, delivery diagnostics,
  and the backend health surface. Apply it before the matching application
  deploy while legacy RPCs remain available.
- `20260718121000_core_backend_enforcement.sql` is the post-deploy enforcement
  step. It installs lifecycle graph guards, removes participant direct-write
  policies, and revokes obsolete creation RPCs. Apply it only after the new
  application paths pass authenticated smoke tests.

The tournament participant table is editable only before the first tournament
result. The admin console's replacement action preserves the selected seed and
regenerates the complete pre-play draw; the database participant-lock trigger
rejects the same operation after play begins.

Tournament cover photos use the public `tournament-images` bucket. Only admins
may write or delete objects there; players receive read-only public images on
the tournament list and detail pages. The browser crops and resizes accepted
source images to a 1280 x 560 WebP before upload.

The player, match, confirmation, rating-history, reign, tournament, participant,
fixture, court, notification, and minimal metadata-audit tables exist in
migration form. A broader admin activity feed remains a later phase.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe
  client config.
- `SUPABASE_SECRET_KEY` — **server-only** service-role key. Required for player
  invites, safe deletion of unused identities, and rebuilding derived ratings
  after ranked or tournament approval. Never expose it to the browser or commit
  it; `.env*` is git-ignored.
- `NEXT_PUBLIC_SITE_URL` — canonical invite origin. Set it to
  `https://ciabatta-cup.app` in production.
- `RESEND_API_KEY` — server-only Resend key for tournament lifecycle mail.
- `TOURNAMENT_EMAIL_FROM` — verified sender identity, for example
  `Ciabatta Cup <cup@example.com>`.

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

For ADR-0036 production rollout, use this exact sequence:

1. Run `ops/planned_match_workflow_audit.sql` read-only.
2. Apply `20260718120000_core_backend_hardening.sql`.
3. Deploy the application and smoke-test ordinary, admin, external, planned,
   correction, practice, and notification paths.
4. Apply `20260718121000_core_backend_enforcement.sql`.
5. Run `ops/core_backend_health.sql`, then use the organiser rating rebuild once.

## Local database validation

Docker and the Supabase CLI are committed development requirements. Start the
local project, run the focused pgTAP contracts, and lint the database with:

```bash
npm run db:start
npm run db:test
npm run db:lint
```

`supabase/config.toml` defines the isolated local ports. The database tests live
under `supabase/tests/database` and are also run by CI. Keep `.env.local` valid
dotenv syntax because the CLI parses it during local commands.

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
<a href="https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password&token_hash={{ .TokenHash }}&type=recovery">
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
# Activity points and practice

## Planned matches and Zeus notifications

Apply `20260714120000_planned_matches_notifications.sql` after the activity-points migrations. It adds planned match shells, result proposals, Zeus notifications, and the nullable `matches.planned_match_id` link with participant/recipient RLS.

Apply the two `2026071612*` repair migrations only after all three `2026071512*`
inbox migrations. Before production cleanup, list shells joined to proposals,
linked matches, sets, and notifications. A test shell may be hard-deleted only
when a guarded transaction proves it has no approved linked match; delete the
non-approved match first, then the shell so child rows cascade safely.
Use `ops/planned_match_workflow_audit.sql` for the read-only preflight. The
companion cleanup script aborts unless exactly two IDs are supplied and aborts
again if either plan has an approved immutable fact.

Apply `20260717120000_admin_match_logging.sql` after the two workflow-repair
migrations. It adds the audited `admin_logged_by` field, the admin-only atomic
entry RPC, and notification fan-out that skips confirmation/approval requests
while informing both participants of the final organiser-entered result.

Apply `20260712120000_profile_play_days.sql` before `20260713120000_ladder_points_practice.sql`. The latter adds organiser-reviewed `practice_sessions`, owner/admin RLS, field constraints, and reviewed-fact immutability. After deployment, use the existing admin rebuild control once so the persisted points snapshot matches the activity economy; read surfaces compute current Melbourne-day decay from facts.
