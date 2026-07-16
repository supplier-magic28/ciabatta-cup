# Production release and recovery runbook

The production origin is `https://ciabatta-cup.app`. This runbook covers the
account-bound configuration and compatible migration/application sequence that
cannot be enforced entirely in source control.

## 1. Preflight and release gate

From a clean checkout with valid dotenv syntax:

```bash
npm install
npm run verify
npm run db:start
npm run db:test
npm run db:lint
```

Do not merge when a required check is skipped. GitHub branch protection for
`main` must require the application verification, database-from-scratch,
documentation-impact, and authenticated integration jobs. The integration job
is pinned to Node.js 24 because the Supabase Realtime client requires a native
WebSocket. It uses disposable player/opponent/admin accounts and proves ranked
submit -> confirm -> approve -> cache rebuild -> exact ladder/profile
agreement.

## 2. Environment and providers

Configure Production and Preview in Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL=https://ciabatta-cup.app
RESEND_API_KEY
TOURNAMENT_EMAIL_FROM=Ciabatta Cup <verified@ciabatta-cup.app>
```

The publishable values may reach the browser. `SUPABASE_SECRET_KEY`,
`RESEND_API_KEY`, and `TOURNAMENT_EMAIL_FROM` are server-only. Verify the Resend
sending domain and sender before testing custom match, practice, planned-match,
RSVP, or tournament mail. Resend receives the outbox idempotency key so an
ambiguous retry cannot create a second message.

In Supabase Auth URL Configuration set:

```text
Site URL: https://ciabatta-cup.app
Invite callback: https://ciabatta-cup.app/auth/confirm?next=%2F
Recovery callback: https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password
Local invite callback: http://localhost:3000/auth/confirm?next=%2F
Local recovery callback: http://localhost:3000/auth/confirm?next=%2Fupdate-password
```

Configure Supabase custom SMTP with the verified domain and disable click
tracking for Auth links. Auth mail is provider-owned and intentionally does not
enter the product custom-email outbox.

Invite template:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">
  Accept your Ciabatta Cup invitation
</a>
```

Recovery template:

```html
<a href="https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password&token_hash={{ .TokenHash }}&type=recovery">
  Set a new Ciabatta Cup password
</a>
```

## 3. Apply migrations compatibly

Applied migration files are immutable. Link the intended Supabase project,
inspect pending history, and apply committed SQL in filename order:

```bash
supabase link
supabase migration list
supabase db push
```

For the current hardening release:

1. Confirm production is healthy through
   `20260718126000_cup_trophies_and_invites.sql`. The committed operations file
   already targets health v5, so take the pre-migration SQL Editor snapshot with
   the version that exists at migration 126:

   ```sql
   select public.core_backend_health_v2();
   ```
2. Enter read-only maintenance for domain mutations and custom-email actions,
   then let in-flight application requests drain. Migration 127 begins writing
   unified intents while the old application acknowledges delivery only in
   legacy ledgers, so this release has no unattended mixed-write window.
3. Apply these **additive** migrations consecutively in exact order before
   deploying callers:

   - `20260718127000_unified_email_delivery_outbox.sql`;
   - `20260718128000_workflow_consistency_hardening.sql`;
   - `20260718129000_transaction_invariant_repairs.sql`.

   They add the unified outbox, active/fact-safe workflow boundaries, clean-
   stack grants, payload-safe retry checks, canonical tournament standings/
   placement and draw/replacement/cover RPCs, legacy-ledger reconciliation,
   and `core_backend_health_v5`. Migration 129 promotes conflicting legacy
   `sent`/`failed` receipts into already-created outbox rows so delivered mail
   cannot reappear as actionable recovery work.
4. Run `supabase/ops/core_backend_health.sql` immediately after migration 129.
   Confirm recent legacy claims remain `processing`, legacy sent receipts are
   terminal in the outbox, superseded intent is non-actionable, required
   infrastructure is present, and no new integrity issue exists.
5. Deploy the application version that uses the unified outbox,
   `submit_practice_v1`, v2 RSVP, scoped metadata completion, atomic group draw/
   participant replacement/stage/finalisation/cover RPCs, deletion blockers,
   and health v5. Ensure every old application instance has drained.
6. While general writes remain frozen, perform the core and cup/RSVP smoke tests
   below. Smoke one reconstructable delivery and verify its row reaches `sent`
   or a recoverable `failed` state. Require
   `fact_version = built_version`, zero genuine drift, exact participant/
   placement set agreement, and no lifecycle integrity issue.
7. Only then apply `20260718130000_rpc_mutation_path_enforcement.sql`. It revokes
   obsolete direct practice, RSVP, email-ledger, and broad cup mutation paths;
   activates active-member Storage policies; and installs transaction-marker
   guards around championship stages, placements, and completion. It also
   supplies explicit clean-stack service-role reads and organiser-bootstrap
   access plus the guarded invitee activation columns required when automatic
   Data API grants are disabled.
8. Repeat health, practice retry, RSVP, group draw/replacement, stage,
   completion, cover, and delivery recovery checks against the enforced
   boundary, then reopen general mutations.

A plain `supabase db push` from a checkout containing migrations 127-130 applies
all four pending files and bypasses the enforcement gate. For this release,
apply each whole file separately in the SQL Editor or deploy from staged
artifacts. If SQL Editor is used, repair remote migration history after each
successful stage; direct SQL execution does not record migration versions.

Never deploy routes that call a new RPC before its additive migration, and never
apply migration 130 while any live application instance still uses a direct
write it revokes. After enforcement, recover with a forward migration/application
fix; never edit an applied migration or roll an old direct-write client back
into service.

## 4. Core production smoke test

Use non-disposable genuine accounts only for a real result; approved facts are
immutable.

1. Sign in as an active member and submit a ranked result with a stable
   operation key. Verify one match, all sets, submitter confirmation, opponent
   Zeus card, and both ranked-log email intents.
2. Sign in as the opponent, confirm, and verify the match moves to
   `pending_approval` and active organisers receive one deduped review card.
3. Sign in as an active organiser and approve. Verify the fact is immutable and
   the cache rebuild completes after the transaction.
4. Confirm `/admin/health` has matching cache versions, no drift or lifecycle
   issue, and only genuinely actionable email rows.
5. Compare the exact activity total, ordinary Elo history, ladder position,
   points timeline, and both player profiles. They must agree with the same
   canonical projection.
6. Retry the same creation/confirmation/approval inputs. Verify no duplicate
   match, confirmation, Zeus row, email intent, or provider delivery.
7. Submit one genuine practice claim and retry its captured operation key.
   Verify `submit_practice_v1` returns the same fact ID, there is one pending row
   and one `practice_logged` intent, and pending creation does not advance the
   scoring fact version. Approve or reject it through the normal organiser
   review path.

Also verify an inactive player and inactive admin can still read permitted
history but cannot submit, review, invite, tag, or manage a cup.

## 5. Configurable cup and RSVP smoke test

1. Create a draft cup with timezone, start time, venue/court, optional default
   surface, cover/crop, seat count, group/playoff formats, and championship
   path. Save and reload each configuration stage; verify cover/crop changes use
   `update_tournament_cover_v1` after enforcement.
2. Invite bench players with a browser-offset-aware response deadline. Verify
   one generation-specific Zeus card and outbox intent per player. Retrying
   delivery must not change RSVP state; re-inviting an expired player advances
   generation; an accepted RSVP remains accepted.
3. Confirm RSVP does not alter the ordered roster. Fill every seat with active
   players, review the generated draw, and permanently lock it. Verify locked-in
   intents exist for the complete roster and all frozen fields reject edits.
   Before lock, repeat the exact group-draw replacement and one participant
   substitution; verify exact retries do not rewrite, conflicting payloads fail,
   and roster plus regenerated draw never become partially visible.
4. Record every fixture with its ruleset. Verify each result is immediately
   approved, immutable, stamped with tournament metadata, and excluded from
   ordinary activity/Elo awards.
5. Advance through any tiebreak/semifinal/final stages. Repeat each advance and
   confirm no duplicate fixtures; a conflicting payload must fail and exact
   pairings must match canonical database standings.
6. Complete the cup. Verify completion and every 1-N placement commit together,
   public activity points use 100/50/20/10/0..., and the first-place trophy is
   derived from that placement.
7. Send official result mail and verify every persisted placement 1-8 receives
   exactly one recap, including zero-point placements.

## 6. Health, email, and cache recovery

`/admin/health` is the primary organiser surface. The equivalent SQL report is
`supabase/ops/core_backend_health.sql`, which calls
`core_backend_health_v5()`. The current projection reports:

- scoring `fact_version`, `built_version`, last build, and genuine drift;
- guarded lifecycle inconsistencies;
- completed cups whose participant and placement sets differ, even when counts
  happen to match;
- required status/notification/outbox triggers and Realtime publication;
- pending, failed, and fifteen-minute-stale custom email deliveries.

For cache drift, preserve the source facts, repair configuration/migration
state, and use the organiser rebuild. A version race retries once; persistent
drift requires investigation before another lifecycle release.

For custom email, retry only through the guarded health action. It reloads the
canonical entity and recipient, reuses the original idempotency key, and never
accepts an address/body from the browser. A provider-accepted message whose
receipt could not be saved is safe to retry with the same key. A sent row cannot
be rewritten with another provider receipt. Superseded rows are retained for
audit but are not retryable; unknown legacy kinds remain manual diagnostics.

For an integrity issue, stop consequential mutations for that workflow, retain
all facts, inspect the named entity IDs, and repair with a reviewed forward-only
migration. Never edit an applied migration or delete an approved fact to make
the health panel green.

## 7. Auth verification

Invite a test identity and verify the email reaches `/auth/confirm`, then
`/accept-invite`; set a password and confirm the profile becomes active only
after password persistence. Request recovery from `/forgot-password`, follow
the recovery callback, update the password, and sign in again. Confirm safe
internal `next` paths survive authentication while external/protocol-relative
destinations are rejected.

## 8. Trophy 3D and Android AR verification

Trophy GLBs and posters are versioned static files served by the existing
Vercel deployment; they require no provider account or environment variable.
Run `npm run assets:trophies:check` before deployment and follow the production
device matrix in [`docs/TROPHY_ASSETS.md`](TROPHY_ASSETS.md). Android placement
is not released until that physical smoke passes. iPhone Quick Look remains
disabled until a separate real-iPhone smoke is recorded.
GLB and USDZ paths must remain outside the authentication proxy because Android
Scene Viewer fetches the model independently of the signed-in browser session.
