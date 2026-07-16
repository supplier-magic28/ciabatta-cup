# Ciabatta Cup status

**Last updated:** 2026-07-18

This is the short operational handover. Durable architecture belongs in
`ARCHITECTURE.md`, current lifecycle contracts in `docs/WORKFLOWS.md`, the data
model in `docs/SCHEMA.md`, and decision history in the ADR index.

## Deployment state

- Production migrations through
  `20260718129000_transaction_invariant_repairs.sql` are operator-reported
  applied in filename order through the SQL Editor. The post-129 health snapshot
  reported zero cache drift, no integrity issues, 18 terminal sent deliveries,
  and no actionable deliveries. The reconciliation itself changed zero rows,
  which is expected when no legacy delivery outcome needs importing.
- `20260718130000_rpc_mutation_path_enforcement.sql` remains unapplied. Deploy
  and smoke the canonical RPC application while general mutations remain
  frozen, then apply migration 130 and repeat the smoke suite before reopening.
  V1 RSVP and standings-completion signatures remain compatibility wrappers.
- The current branch also hardens documentation/verification: canonical
  workflow and ADR registries, diff-aware doc impact, recursive start/finish
  rules, aggregate verification, isolated browser-server startup, and updated
  redirect contracts.

## Current architecture state

- Public rank is the canonical Melbourne-day activity-points projection;
  ordinary ranked Elo is a separate pure analysis/seeding projection. Approved
  sporting facts remain immutable and all persisted scoring output is
  rebuildable behind a version guard.
- Consequential match and planned-match changes use authenticated RPCs. The new
  consistency migration extends active-actor enforcement, fact-safe deletion,
  scoring-version precision, idempotent practice creation, RSVP generations,
  lifecycle revisions, scoped Zeus completion, canonical cup standings/draw/
  replacement/stage/placement/cover RPCs, and atomic completion boundaries.
- Final enforcement makes practice, RSVP, custom/legacy email ledgers, cup
  stages, placements, and completion RPC-only; direct broad cup grants are
  revoked and active-member avatar policies are enforced in Storage.
- Custom match, practice, planned-match, RSVP, and tournament mail converges on
  one reconstructable outbox with atomic claims, terminal supersession for
  obsolete RSVP generations, and health recovery. Supabase Auth confirmation/
  invite/recovery mail remains provider-owned by design.
- `/tournaments` now separates upcoming cups from the archive around an
  always-visible personal trophy case. Ranked first-place awards, repeat
  collectibles, event metadata, cover crops, and the winner's complete approved
  campaign are derived read-only from existing placement and match facts; the
  cabinet now completes a brightened, audible-when-enabled selection shake
  before opening its browser-zoom-safe sheet. Synthesized cabinet sound is
  persistently mutable and reduced-motion selection opens immediately. A
  registered Claymore action now opens an owned full-screen viewer backed by a
  validated versioned GLB and a chronological engraving ledger derived across
  every completed event sharing its physical `trophy_key`. Supported Android
  devices may hand off to WebXR or Scene Viewer without a paid AR service or a
  direct camera stream; generic trophies remain 2D and iPhone Quick Look stays
  disabled until physical-device testing is available.

## Latest verification

The current migration and application tree has passed every constituent of the
aggregate application preflight plus the complete pgTAP inventory. The local
Supabase CLI lint/integration commands remain separately blocked by the dotenv
syntax issue recorded below.

| Check | Result |
| --- | --- |
| Aggregate application preflight | Passed on the current tree; every `npm run verify` constituent is green |
| ESLint / TypeScript | Passed / passed |
| Vitest | 285 tests passed; one fresh-Supabase integration test skipped by design |
| Documentation gates | `docs:check` and `docs:impact` passed; structural fixtures 16/16 and impact fixtures 8/8 passed |
| Production build | Passed |
| UI performance contracts | 11/11 passed; these are geometry/query-shape contracts only |
| Browser smoke | 8/8 passed on a runner-owned dynamic port with exact preserved `next` destinations |
| Database pgTAP/lint | All 256 declared pgTAP assertions passed locally and on a fresh CI stack (27+21+18+10+50+56+74); database lint passed after clean migration application |
| Authenticated ranked integration | Passed on a disposable Node 24/Supabase stack: ranked submit, opponent confirm, organiser approve, cache rebuild, and exact ladder/profile agreement |
| Production post-129 health | Operator-reported zero drift, no integrity issues, 18 sent deliveries, and no actionable deliveries |

## Active risks

- Android camera permission, plane detection, placement/scale, WebXR, and Scene
  Viewer fallback require the production-HTTPS physical-device smoke in
  `docs/TROPHY_ASSETS.md`; automation validates the viewer and capability
  boundaries but cannot certify those device-owned behaviors. iPhone AR is
  intentionally disabled and unverified.
- The genuine production ranked submit -> opponent confirm -> organiser approve
  -> notification/email -> automatic rebuild -> exact ladder/profile agreement
  loop is still awaiting a credentialed smoke test.
- The running local database contains migrations 127-130 from direct SQL
  verification, but those versions are not recorded in
  `supabase_migrations.schema_migrations`. After repairing `.env.local`, rebuild
  this disposable local stack from migrations before treating its history as a
  clean-application proof.
- Production migrations 127-129 were applied through the SQL Editor, so their
  remote migration-history entries still need to be marked applied before a
  future linked `db push`. Migration 130 must remain pending until the new
  application has deployed and passed the controlled production smoke suite.
- The amended migration 130 has 74/74 focused and 256/256 aggregate local and
  fresh-stack CI coverage. It remains gated only on confirming the new
  application deployment and completing the controlled pre-enforcement
  production smoke suite.
- Until the application cutover and final enforcement complete, old application
  instances can still use legacy email-ledger and direct mutation paths that
  migration 130 is designed to revoke.

## Next work

1. Repair `.env.local` syntax without committing it; reset the disposable local
   stack from migrations, then run the aggregate database suite/lint,
   migration-from-scratch, and authenticated lifecycle checks.
2. Deploy the canonical RPC application with mutations still frozen, drain old
   instances, and run the controlled pre-enforcement health/smoke gate. Then
   apply migration 130, repeat the gate, and reopen using `docs/DEPLOYMENT.md`.
3. Execute the credentialed production ranked lifecycle and configurable cup/
   RSVP/result-email smoke tests. Require zero genuine drift, no lifecycle
   integrity issue, complete placements, and exact projection agreement.
