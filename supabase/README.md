# Supabase

Database migrations for Ciabatta Cup. The authoritative data model is
`docs/SCHEMA.md`; migrations are built in phases (ADR-0003).

## Migrations

`migrations/` is append-only and applies in exact filename order. This inventory
is intentionally exact; never edit an applied file or move a filename.

1. `20260709000000_players_spine.sql` - player spine, roles/status, RLS, and admin helper.
2. `20260709010000_handle_new_user.sql` - Auth-to-player trigger and activation guard.
3. `20260709020000_guard_exempt_backend.sql` - trusted backend bootstrap exemption.
4. `20260710000000_matches_spine.sql` - immutable matches, sets, confirmations, RLS.
5. `20260710010000_invited_profile_status.sql` - invited Auth profile status.
6. `20260710020000_advance_on_confirmation.sql` - ranked/exhibition confirmation advance.
7. `20260710030000_rating_cache.sql` - rebuildable Elo history and points snapshot seam.
8. `20260710040000_ciabatta_reigns.sql` - rebuildable holder-history cache.
9. `20260710050000_fix_invited_profile_status_cast.sql` - explicit invite-status enum cast.
10. `20260710060000_unranked_players_zero_points.sql` - zero baseline for unranked players.
11. `20260710070000_tournament_day_release.sql` - tournament/participant/fixture spine and result RPC.
12. `20260710090000_profile_settings_and_avatars.sql` - profile preferences and avatar storage.
13. `20260710100000_tournament_cover_photos.sql` - tournament cover storage.
14. `20260710110000_tournament_draw_lock_and_emails.sql` - draw lock and legacy tournament email ledger.
15. `20260710120000_optional_round_robin_completion.sql` - standings completion and skipped fixtures.
16. `20260710130000_tournament_placement_awards.sql` - placement awards and result-email kinds.
17. `20260710140000_safe_rating_cache_rebuild.sql` - safe full cache replacement.
18. `20260712090000_external_match_type.sql` - external match enum value.
19. `20260712100000_non_ciabatta_opponents.sql` - private opponents and atomic external results.
20. `20260712110000_delete_own_external_matches.sql` - owner deletion of external test facts.
21. `20260712120000_profile_play_days.sql` - manual Melbourne tennis-day facts.
22. `20260713120000_ladder_points_practice.sql` - public activity points and practice review.
23. `20260714120000_planned_matches_notifications.sql` - planned shells, proposals, and Zeus inbox.
24. `20260715120000_courts_surfaces_zeus_inbox.sql` - canonical courts, metadata tags, and destinations.
25. `20260715121000_seed_untagged_notifications.sql` - initial missing-metadata nudges.
26. `20260715122000_reliable_realtime_notifications.sql` - transactional dedupe and Realtime publication.
27. `20260716120000_match_workflow_repair_types.sql` - correction states and notification links.
28. `20260716121000_atomic_match_workflows.sql` - row-locking planned/ordinary workflow RPCs.
29. `20260717120000_admin_match_logging.sql` - audited organiser-entered results.
30. `20260718120000_core_backend_hardening.sql` - operation keys, shared validation, cache versioning, diagnostics.
31. `20260718121000_core_backend_enforcement.sql` - lifecycle guards and retired direct writes.
32. `20260718122000_admin_health_recovery.sql` - organiser health and reconstructable recovery.
33. `20260718122500_configurable_cup_enums.sql` - configurable cup enums.
34. `20260718123000_configurable_cup_builder.sql` - 2-8 seats, formats, atomic draw, placements, health v2.
35. `20260718124000_configurable_cup_builder_enforcement.sql` - retire superseded cup RPC grants.
36. `20260718125000_cup_trophy_invite_types.sql` - trophy/RSVP enum additions.
37. `20260718126000_cup_trophies_and_invites.sql` - trophy identity and v1 RSVP facts/RPCs.
38. `20260718127000_unified_email_delivery_outbox.sql` - unified custom-email intent, claim, recovery, and health v3.
39. `20260718128000_workflow_consistency_hardening.sql` - active actors, fact-safe deletion, precise scoring triggers, idempotent practice submission, safe RSVP generations, tournament atomicity, and health v4.
40. `20260718129000_transaction_invariant_repairs.sql` - clean-stack grants, deterministic cup standings/placements, payload-safe retries, lifecycle revisions, atomic draw/replacement/cover RPCs, legacy outbox reconciliation, and health v5.
41. `20260718129500_preplay_draw_unlock.sql` - guarded organiser draw unlock before the first cup result.
42. `20260718130000_rpc_mutation_path_enforcement.sql` - revoke direct practice, RSVP, email-ledger, cup, placement, and championship-stage writes after callers use the canonical RPCs; supply explicit clean-stack service reads, organiser bootstrap, and guarded invite-activation column grants.
43. `20260722100000_director_final_override.sql` - audited four-player director override that preserves group facts and the skipped decider, installs a best-of-three final, and derives the remaining placements from table order.
44. `20260722101000_standings_director_final_override.sql` - extends that audited override to an existing four-player standings cup without changing its configured path.

The final five migrations are one compatible rollout chain. Apply the additive
outbox, workflow, invariant, and pre-play-unlock migrations (127-1295) in order, deploy the
application that uses their canonical RPCs, prove the smoke/health contracts,
and only then apply enforcement migration 130. Migration 129 supplies explicit
clean-stack SQL grants needed by the rolling application; migration 130 removes
the obsolete direct mutation paths. V1 RSVP and standings-completion signatures
remain safe wrappers over current implementations. See ADR-0042, ADR-0043, and
`docs/WORKFLOWS.md`.

The pre-play-unlock pgTAP fixture must create its roster and group preview while
the cup is unlocked, then set `draw_locked_at` before exercising the RPC. A
fixture that inserts participants after locking tests the participant guard and
never reaches the unlock contract. The focused contract covers successful and
idempotent unlock, preserved preview/roster rows, ordinary-player and direct-
write refusal, and independent match/placement refusal.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe
  client config.
- `SUPABASE_SECRET_KEY` — **server-only** service-role key. Required for player
  invites, safe deletion of unused identities, and rebuilding derived ratings
  after ranked or tournament approval. Never expose it to the browser or commit
  it; `.env*` is git-ignored.
- `NEXT_PUBLIC_SITE_URL` — canonical invite origin. Set it to
  `https://ciabatta-cup.app` in production.
- `RESEND_API_KEY` — server-only Resend key for custom match, practice,
  planned-match, RSVP, and tournament mail.
- `TOURNAMENT_EMAIL_FROM` — verified sender identity, for example
  `Ciabatta Cup <cup@example.com>`.

Trophy GLB/USDZ files are versioned application assets, not Supabase Storage
objects. They deliberately contain no player or tournament facts and bypass the
application auth proxy so Android Scene Viewer can fetch them without browser
cookies (ADR-0044). Ownership and engravings remain authenticated server reads.

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

For a fresh project, apply the complete inventory once. For a production
project already through the cup/RSVP migration, use this exact sequence:

1. Preserve the migration-126 health snapshot with
   `select public.core_backend_health_v2();`. Do not use
   `ops/core_backend_health.sql` yet because it targets v5 from migration 129.
2. Freeze domain mutations/custom-email actions and drain in-flight requests.
3. Apply `20260718127000_unified_email_delivery_outbox.sql`,
   `20260718128000_workflow_consistency_hardening.sql`, and
   `20260718129000_transaction_invariant_repairs.sql`, then
   `20260718129500_preplay_draw_unlock.sql` consecutively in that
   order. Migration 129 reconciles both missing legacy rows and conflicts where
   migration 127 already created a pending intent before the old sender recorded
   `sent` or `failed`.
4. Run `ops/core_backend_health.sql` and require healthy v5 infrastructure with
   no delivered legacy receipt left actionable.
5. Deploy the application that uses `submit_practice_v1`, v2 RSVP, atomic group
   draw/participant replacement/stage/finalisation/cover RPCs, unified email
   claims, and `core_backend_health_v5`; ensure every old instance has drained.
6. While general writes remain frozen, run the health, ranked, practice, RSVP,
   cup, cache, and delivery smoke tests.
7. Apply `20260718130000_rpc_mutation_path_enforcement.sql` only after those
   checks are green. Repeat them against the enforced boundary, then reopen
   mutations.

For the director-seeded final release, apply
`20260722100000_director_final_override.sql` in full before deploying its
application caller. It is compatible whether migration 130 is still staged or
already enforced. Confirm
`to_regprocedure('public.override_tournament_final_v1(uuid,uuid,uuid,text)')`,
record version `20260722100000` in remote migration history, and only then use
the override control. For an existing standings-path cup, then apply
`20260722101000_standings_director_final_override.sql` and record that version
before deploying the broadened caller. The RPC refuses any cup whose
championship-stage scoring has started.

Do not run a plain `supabase db push` from this release because it will
also apply migration 130 before its smoke gate. When the SQL Editor is used,
run each complete file separately and then record successful application with
`supabase migration repair --linked --status applied` for timestamps 127-1295;
record 130 separately after enforcement.

New work reads `core_backend_health_v5()`. Pending, failed, and fifteen-minute-
stale custom delivery can be retried only when canonical entity and recipient
facts reconstruct the original message. Superseded rows remain audit history
but are not actionable. Supabase Auth mail remains outside this outbox and is
recovered through the provider configuration.

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

The committed pgTAP inventory and declared assertion plans are exact:

1. `core_backend_hardening.test.sql` - 27 assertions.
2. `core_workflows.test.sql` - 21 assertions.
3. `20260718123000_configurable_cup_builder.test.sql` - 18 assertions.
4. `20260718126000_cup_trophies_invites.test.sql` - 10 assertions.
5. `20260718127000_unified_email_outbox.test.sql` - 50 assertions.
6. `20260718128000_workflow_consistency_hardening.test.sql` - 56 assertions.
7. `20260718129000_transaction_invariants.test.sql` - 74 assertions.

`npm run db:test` executes that filename order. The declared total is 256;
record an actual pass count only from command output for the current tree.

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

Do not bootstrap by disabling integrity triggers. If the trusted SQL Editor
update fails, stop and reconcile the full ordered migration history first.

## Operational contracts

- `docs/SCHEMA.md` defines the current conceptual model and invariants.
- `docs/WORKFLOWS.md` defines current actors, RPCs, transitions, notification,
  email, scoring, idempotency, and recovery behaviour.
- `docs/DEPLOYMENT.md` defines production migration order, configurable-cup
  smoke tests, custom-email recovery, and Auth verification.
- `ops/planned_match_workflow_audit.sql` and `ops/core_backend_health.sql` are
  read-only operator diagnostics. Never delete an approved fact to clear an
  audit; repair inconsistencies through a reviewed forward-only migration.
