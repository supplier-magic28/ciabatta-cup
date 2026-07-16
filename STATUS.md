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

## Latest verification

The current migration and application tree has passed every constituent of the
aggregate application preflight plus the complete pgTAP inventory. The local
Supabase CLI lint/integration commands remain separately blocked by the dotenv
syntax issue recorded below.

| Check | Result |
| --- | --- |
| Aggregate application preflight | Passed on the current tree; every `npm run verify` constituent is green |
| ESLint / TypeScript | Passed / passed |
| Vitest | 268 tests passed; one fresh-Supabase integration test skipped by design |
| Documentation gates | `docs:check` and `docs:impact` passed; structural fixtures 16/16 and impact fixtures 8/8 passed |
| Production build | Passed |
| UI performance contracts | 5/5 passed; these are geometry/query-shape contracts only |
| Browser smoke | 7/7 passed on a runner-owned dynamic port with exact preserved `next` destinations |
| Database pgTAP/lint | All 253 declared pgTAP assertions passed (27+21+18+10+50+56+71). `db:lint` remains blocked before connection by malformed line 1 of `.env.local` |
| Authenticated ranked integration | Implemented for a disposable Supabase CI stack; locally skipped and not yet verified because the same environment-file error prevents stack setup |
| Production post-129 health | Operator-reported zero drift, no integrity issues, 18 sent deliveries, and no actionable deliveries |

## Active risks

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
