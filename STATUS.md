# Ciabatta Cup status

**Last updated:** 2026-07-22

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
- `20260718129500_preplay_draw_unlock.sql` was operator-confirmed applied in full
  through the SQL Editor on 2026-07-20, and the production
  `to_regprocedure('public.unlock_tournament_draw_v1(uuid)')` check succeeded.
  Its remote migration-history entry still needs to be marked applied.
  `20260718130000_rpc_mutation_path_enforcement.sql` remains unapplied until the
  repaired caller passes its production smoke. V1 RSVP and standings-completion
  signatures remain compatibility wrappers.
- The current branch also hardens documentation/verification: canonical
  workflow and ADR registries, diff-aware doc impact, recursive start/finish
  rules, aggregate verification, isolated browser-server startup, and updated
  redirect contracts.
- The draw-unlock release repair now aligns the admin control with the database's
  any-match boundary, preserves distinct operator-facing rollout/fact/auth/not-
  found failures, and exercises the RPC only after building a legal unlocked
  roster and fixture preview. The production migration gate is now satisfied.
- The current repair branch adds a guarded director-seeded final for the
  four-player Claymore edge case. Migration
  `20260722100000_director_final_override.sql` and its application caller remain
  undeployed pending fresh-stack verification. Database review tightened the
  transition to preserve the pending decider as an explicitly skipped audit
  row rather than deleting fixture history.

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
  registered Claymore and ranked-cup actions now open an owned full-screen
  viewer backed by validated versioned GLBs. The Claymore keeps a chronological
  ledger across its physical `trophy_key`; each unnamed ranked win instead uses
  its event name plus `Cup` and keeps a single-event engraving, making the
  existing Ciabatta Qualifier Cup directly testable. Supported Android
  devices may hand off to WebXR or Scene Viewer without a paid AR service or a
  direct camera stream. Android candidates keep the placement action while
  asynchronous capability detection settles and fall back to an explicit
  `ar_preferred` Scene Viewer floor-placement intent. Model files bypass
  authentication for platform handoff, while iPhone Quick Look stays disabled
  until physical-device testing is available. Registered tournament trophies
  also expose an admin-only pre-event preview from the director console, so the
  exact production model and Android floor-placement stage can be tested before
  a winner exists without creating a placement, award, or engraving.

## Latest verification

The director-final override is not yet included in the verified baseline below.
Its focused application and database contracts, aggregate preflight, and fresh-
stack CI are pending.

The repaired tree passed the complete local application preflight and the
fresh-stack GitHub CI run for commit `3630ceb`. The corrected database contract
now reaches the unlock RPC and the full Database, Application, Documentation,
and ranked-lifecycle gates are green.

| Check | Result |
| --- | --- |
| Aggregate application preflight | Passed on the repaired tree, including production build and browser checks |
| ESLint / TypeScript | Passed / passed |
| Vitest | 295 tests passed; one fresh-Supabase integration test skipped by design |
| Documentation gates | `docs:check` and `docs:impact` passed; structural fixtures 16/16 and impact fixtures 8/8 passed |
| Production build | Passed |
| UI performance contracts | 12/12 passed; these are geometry/query-shape contracts only |
| Browser smoke | 10/10 passed on a runner-owned dynamic port, including public immutable GLB delivery and exact preserved `next` destinations |
| Database pgTAP/lint | Passed on the fresh disposable stack in GitHub run 29712930430. The corrected 14-assertion contract reaches the RPC and the complete database suite/lint are green. |
| Authenticated ranked integration | Passed in GitHub run 29712930430 on a disposable Node 24/Supabase stack: ranked submit, opponent confirm, organiser approve, cache rebuild, and exact ladder/profile agreement |
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
- Docker Desktop is unavailable locally, so the corrected database contract was
  proven on GitHub's disposable fresh stack rather than the workstation stack.
- Production migrations 127-1295 were applied through the SQL Editor, so their
  remote migration-history entries still need to be marked applied before a
  future linked `db push`. Migration 130 must remain pending until the repaired
  application has deployed and passed the controlled production smoke suite.
- The amended migration 130 has 74/74 focused and 256/256 aggregate local and
  fresh-stack CI coverage. It remains gated only on confirming the new
  application deployment and completing the controlled pre-enforcement
  production smoke suite.
- Until the application cutover and final enforcement complete, old application
  instances can still use legacy email-ledger and direct mutation paths that
  migration 130 is designed to revoke.

## Next work

1. Verify the director-final override migration/action locally where available
   and on fresh-stack CI. Apply migration 132 before deploying its caller, then
   use the audited control to seed the Claymore final.
2. Let the repaired `main` deployment drain old instances, then run the
   controlled pre-enforcement draw-unlock/relock and health smoke with general
   mutations still frozen. Record migration 1295 in remote history. Then apply
   migration 130, repeat the gate, and reopen using `docs/DEPLOYMENT.md`.
3. Execute the credentialed production ranked lifecycle and configurable cup/
   RSVP/result-email smoke tests. Require zero genuine drift, no lifecycle
   integrity issue, complete placements, and exact projection agreement.
