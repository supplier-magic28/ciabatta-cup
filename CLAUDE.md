# CLAUDE.md - operating instructions for AI sessions

This is the single source of truth for how to work in this repository.
`AGENTS.md` points here. The objective is not only to complete the current task,
but to leave the repository easier and safer for the next task.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may
differ from training data. Read the relevant guide in `node_modules/next/dist/docs/`
before writing Next.js code and follow its deprecation notices.
<!-- END:nextjs-agent-rules -->

## Start every task from repository truth

1. Read `STATUS.md` for deployed state, the latest verification, active risks,
   and the next work.
2. Classify every subsystem the requested change can affect. Use the matrix
   below and read all mapped current documents before changing code.
3. Open `docs/decisions/README.md`, follow any **Superseded by** links, and read
   the newest relevant ADR chain. ADRs explain history; they do not replace the
   current contracts in schema and workflow docs.
4. Inspect the implementation and tests that enforce the contract. Prefer
   enforced truth over prose when they disagree, then reconcile the prose in
   the same task.
5. For Next.js work, read the relevant installed guide under
   `node_modules/next/dist/docs/` before relying on framework conventions.

| Impacted subsystem | Read before implementation |
| --- | --- |
| Any functional or runtime behaviour | `STATUS.md` and the relevant tests |
| Architecture, boundaries, or cross-cutting performance | `ARCHITECTURE.md` and the current ADR chain |
| Schema, migration, RLS, grants, security, or database operations | `docs/SCHEMA.md`, `supabase/README.md`, and the current ADR chain |
| Server Actions, RPCs, statuses, approvals, notifications, email, or recovery | `docs/WORKFLOWS.md` and the current ADR chain |
| Public activity points, Elo, cache materialisation, or rankings | `docs/SCHEMA.md`, `ARCHITECTURE.md`, and scoring ADRs/tests |
| Route, shared component, token, loading state, or visual pattern | `docs/DESIGN.md`, `components/README.md`, and the relevant design references |
| Local setup, environment, CI, release, or operator process | `README.md`, `docs/DEPLOYMENT.md`, and `supabase/README.md` where applicable |

## Engineering conventions

- **Knowledge lives in the repo.** Types and schema hold shapes, tests and
  invariants hold behaviour, ADRs hold durable reasoning, `docs/WORKFLOWS.md`
  holds current lifecycle contracts, and `STATUS.md` holds short-lived state.
- **Match and scoring facts are authoritative.** Approved match facts are
  immutable. Tournament placements, public activity points, ordinary Elo,
  rating history, rating snapshots, and Ciabatta reigns are derived or fully
  rebuildable (ADR-0001, ADR-0003, ADR-0024, ADR-0029, ADR-0035).
- **Public points and Elo are different projections.** The ladder displays
  activity points. Ordinary non-tournament ranked results also feed a separate
  pure Elo projection for analysis and seeding.
- **Consequential transitions belong in PostgreSQL.** Use authenticated,
  row-locking RPCs and database invariants for lifecycle changes. Stable
  operation or delivery keys make retries safe. Secondary cache/email work
  never turns a committed fact into an apparent failure.
- **Scoring stays pure.** `lib/scoring/computeRankings` derives ordinary Elo;
  `buildRatingCache` derives the canonical activity ledger, public points, and
  reigns. Neither performs I/O or mutates its inputs.
- **RLS is deny-by-default.** The publishable key is browser-safe. The secret
  key is server-only and never enters client code, logs, or the repository.
- **Right-size the app.** It serves a small private league. Leave seams for
  scale, but add caches, workers, indexes, or observability only for a measured
  need recorded in an ADR.
- **UI is token-driven.** Assemble screens from `components/` primitives and
  `components/tokens.ts`; do not create a parallel visual vocabulary.
- **Preserve user work.** The working tree may contain unrelated changes.
  Never rewrite applied migrations or discard changes you did not create.
- **Commit subjects matter.** The first line is a clear subject under roughly
  70 characters because it becomes the Vercel deployment title.

## Documentation impact matrix

Documentation is implementation, not cleanup. Before completion, update every
row selected by the diff:

| Change | Required update |
| --- | --- |
| Any functional/runtime change | `STATUS.md` |
| Migration, schema, RLS, grant, or security behaviour | `docs/SCHEMA.md`, `supabase/README.md`, and an ADR reference; add an ADR for a durable decision |
| Scoring rule, fact source, cache, or ranking behaviour | `docs/SCHEMA.md` and `ARCHITECTURE.md` |
| Server Action, RPC, status, approval, Zeus notification, custom email, or recovery path | `docs/WORKFLOWS.md` |
| Route or handoff-screen behaviour | `docs/DESIGN.md` |
| Shared component, token, loading, or visual pattern | `components/README.md` and `docs/DESIGN.md` |
| Setup, environment, CI, deployment, or release process | `README.md` and `docs/DEPLOYMENT.md`; update `supabase/README.md` for database operations |
| Durable architecture or policy decision | Append an ADR and update `docs/decisions/README.md`; never rewrite accepted history |

`npm run docs:impact` checks this mapping against the `origin/main` merge base.
A functional change cannot be labelled as having no documentation impact.

## Verification

During development, run the narrowest relevant checks. Before pushing to
`main` or requesting merge, run:

```bash
npm run verify
```

That aggregate preflight covers lint, TypeScript, unit tests, documentation
structure and impact, a production build, UI performance contracts, and browser
smoke tests. For schema, RLS, RPC, or migration changes also run, from a valid
dotenv environment:

```bash
npm run db:start
npm run db:test
npm run db:lint
```

CI must prove migrations from scratch and the authenticated ranked lifecycle on
a disposable Supabase stack before `main` can merge. A local failure is not
waived because another check passed; record genuine environment blockers in
`STATUS.md` with the exact unverified command.

## Definition of Done

A task is complete only when all applicable statements are true:

1. The requested behaviour and its failure/retry paths are implemented.
2. Relevant focused tests and the aggregate preflight are green; database
   checks are green for database work.
3. `STATUS.md` and every diff-mapped canonical document describe the resulting
   current state, not the intended future state.
4. Durable decisions are appended as ADRs and indexed. Existing ADR history is
   never silently rewritten.
5. Consequential pure logic and lifecycle/database invariants have contract
   tests. Shared component changes are reflected in the component inventory.
6. The task answers: **What did this task reveal that a future session should
   not rediscover?** Every durable answer has become a maintained document,
   test, invariant, or automated check before completion.

This final question is the recursive mechanism: each change must improve the
knowledge or enforcement that frames the next change, gradually increasing the
application's consistency, stability, scalability, and performance.
