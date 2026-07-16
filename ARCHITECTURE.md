# Ciabatta Cup - architecture and operating model

This document describes the durable system shape and how the repository keeps
that shape understandable. Read `STATUS.md` for current deployment and
verification state, `docs/WORKFLOWS.md` for current lifecycle contracts, and
the ADR index for decision history.

## 1. Goal and principles

Ciabatta Cup is a private, mobile-first tennis competition for a small group of
friends. The engineering goal is **fearless iteration**: rules and presentation
can change without losing the facts behind the ladder or wondering whether a
workflow partially committed.

- **Knowledge lives in the repository.** Types and schema define shape, tests
  and database constraints enforce behaviour, ADRs preserve reasoning, and
  current-state docs route future work.
- **Facts before projections.** Store durable sporting and lifecycle facts once;
  derive standings, points, Elo, history, and awards from them.
- **One boundary per consequence.** A lifecycle transition that must succeed or
  fail together crosses one row-locking PostgreSQL RPC.
- **Retries are normal.** Creation and delivery operations have stable identities
  so a browser retry or ambiguous provider response cannot duplicate facts.
- **Secondary work cannot rewrite the truth.** Cache rebuild and email failures
  produce explicit recovery warnings after a committed fact; they do not report
  the authoritative transition as failed.
- **Right-size complexity.** The product serves roughly ten people. Preserve
  clean seams for growth, but add workers, caches, indexes, and monitoring only
  after measuring a need.

## 2. System shape

**Stack:** Next.js App Router and TypeScript on Vercel; PostgreSQL, Auth,
Realtime, and Storage on Supabase; Resend for custom product email. GitHub is
the source of truth and CI is the release gate.

```text
Browser
  -> Server Components: owner-safe reads and derived read models
  -> Server Actions: authenticate, validate, call one RPC
  -> PostgreSQL RPC: lock rows, enforce transition, commit facts + intents
  -> post-commit coordinator: rebuild versioned projections, attempt email
  -> explicit success or committed-with-recovery-warning
```

### Authoritative facts and rebuildable projections

Approved match rows and sets are immutable sporting facts. Practice reviews,
manual play days, tournament fixtures and placements, and invitation responses
are authoritative only for their own domain. Current public points are a pure
Melbourne-day activity projection over those sources:

- ranked participation +15 and win +15;
- exhibition or Non-Ciabatta participation +10;
- approved practice +5;
- tournament placement awards;
- permanent derived daily and drought deductions, floored at zero.

Ordinary non-tournament ranked matches separately feed pure zero-floor Elo for
analysis and tournament seeding. Public activity points and Elo must never be
described as the same value. `players.rating_points`, `rating_history`, and
`ciabatta_reigns` are replaceable materialisations, never source facts.

The scoring cache is versioned. Points-affecting transactions increment
`fact_version`; a rebuild installs a snapshot only when its source version is
still current. A racing rebuild retries once, and an organiser can inspect and
repair drift without altering source facts.

### Lifecycle and integration boundaries

Consequential mutation uses authenticated `security definer` RPCs with an empty
`search_path`, explicit grants, actor/status validation, row locks, database
state graphs, and immutable terminal facts. Creation RPCs accept operation keys.
Notifications and custom-email intents are committed with the lifecycle they
describe and deduped by stable recipient/event identities.

For tournaments, application-derived schedules and placement arrays are
requests/checksums, not authority. PostgreSQL validates the complete group draw,
uses one deterministic standings projection, derives the only valid placement
order from approved fixtures, and commits stage/placement/completion facts in
marked RPC transactions. Direct table writes to those boundaries are revoked or
trigger-rejected after the compatible application rollout.

The application coordinates only work that cannot belong to the fact
transaction: provider delivery, cache materialisation, route invalidation, and
presentation-specific file upload. Those stages return a common
committed-with-warning result when recovery remains. The canonical current
contract and deliberate exceptions live in `docs/WORKFLOWS.md`.

### Reads, security, and privacy

Server Components are the default read boundary. Independent queries start
together, and relations needed by one read model are embedded in the same query
wave. A server-only projection service may read complete scoring facts, then
returns only derived public output; it never leaks practice notes, manual-mark
detail, email addresses, or private external-opponent identities.

RLS is enabled by default, but policy and SQL privilege are separate gates:
both must grant the minimum role/owner access. Authenticated domain mutations
require an active player. Inactive members retain historical read access but
cannot mutate league facts or exercise organiser authority. Direct table grants
are removed where a validated RPC owns the mutation. The Supabase secret key is
server-only and is used only for genuine administrative/integration boundaries.

### Presentation architecture

Screens use shared primitives from `components/`, design tokens from
`components/tokens.ts`, and the theme in `app/globals.css`. Route-shaped loading
boundaries reserve final geometry. Mutations acknowledge input immediately but
never optimistically present an immutable score, approval, or points change.
This vocabulary is the consistency seam: change a token or primitive once,
then verify all consuming routes.

## 3. Patterns for consistency, scalability, and performance

| Concern | Default pattern | Scale seam |
| --- | --- | --- |
| Domain integrity | Database constraints, guarded status graphs, row-locking RPCs | More callers can share the same contract without duplicating rules |
| Client-derived tournament data | Validate full request against database standings/results; persist only inside marked RPC transaction | New tournament UIs cannot bypass canonical advancement or placement rules |
| Retry safety | Operation keys, unique constraints, notification/email dedupe keys | Safe queue or webhook retries later |
| Read consistency | One canonical projection per public concept | Materialise or cache behind the same adapter if measurements justify it |
| Scoring changes | Pure replay from immutable facts | Change formula and rebuild; no historical data migration |
| Secondary failure | Commit facts first; return structured recovery warning | Move the same durable email intents to a worker without changing callers |
| Data fetching | Server Components, parallel independent reads, embedded relations | Add indexes/caching only from query plans and measured latency |
| UI consistency | Tokens, shared primitives, route-shaped loading | Visual changes remain bounded and testable |
| Operations | Privacy-safe health projection and guarded recovery actions | External monitoring can consume the same health contract later |

Performance work is evidence-driven. The current Playwright performance suite
checks UI geometry, pending-control stability, reduced motion, mobile overflow,
and query-shape source contracts against a production build. It is **not** a
latency, throughput, Core Web Vitals, or bundle-size benchmark. Add quantitative
budgets only after a repeatable measurement and an ADR define the target.

## 4. Verification strategy

Tests concentrate on high-consequence boundaries:

- Vitest covers pure scoring, validation, read-model, rendering, and action
  coordination contracts.
- pgTAP covers RLS/grants, status graphs, authorization, idempotency, immutable
  facts, RPC transactions, scoring-version effects, and recovery metadata.
- Playwright browser smoke tests cover protected-route redirects and critical
  route behaviour; a disposable-stack integration job exercises authenticated
  ranked submit -> confirm -> approve -> rebuild -> read-model agreement.
- Documentation checks validate canonical files, local links, ordered migration
  inventory, ADR metadata/supersession, route and component inventories,
  workflow IDs, committed design references, and diff-mapped updates.

`npm run verify` is the local aggregate preflight. Database changes additionally
run `npm run db:test` and `npm run db:lint`. Production rollout then uses the
smoke and health checks in `docs/DEPLOYMENT.md`.

## 5. Recursive documentation system

Documentation is layered by job:

| Document | Job | Update cadence |
| --- | --- | --- |
| `ARCHITECTURE.md` | Durable system shape and patterns | Rare |
| `docs/SCHEMA.md` | Current conceptual data model and invariants | Every data-contract change |
| `docs/WORKFLOWS.md` | Current lifecycle, notification, email, and recovery contracts | Every consequential workflow change |
| `docs/decisions/*.md` | Append-only decision history | Every durable decision |
| `docs/decisions/README.md` | Current ADR navigation and explicit supersession | Every ADR |
| `STATUS.md` | Deployment, latest verification, risks, next work | Every functional task |
| `CLAUDE.md` | Start/finish operating rules and impact mapping | When process learns |

Every task starts by classifying its impact and reading the mapped current docs
and newest ADR chain. Every task finishes by asking what a future session should
not have to rediscover. The durable answer becomes a document, test, invariant,
or automated check. `docs:impact` enforces the update mapping against the merge
base, so documentation quality improves recursively as the application changes.

Only tracked, maintained files can be canonical. Raw committed handoffs are
preserved inputs; untracked ZIPs and missing external bundles are never part of
the authority chain. Promote anything durable they reveal into maintained docs,
tokens, tests, or an intentionally committed extracted artifact.

## 6. Document map

- `CLAUDE.md` - mandatory start, implementation, verification, and finish rules
- `STATUS.md` - current deployment and verification handover
- `docs/SCHEMA.md` - current conceptual data model and invariants
- `docs/WORKFLOWS.md` - current lifecycle and mismatch registry
- `docs/decisions/README.md` - ADR index and supersession navigation
- `docs/DESIGN.md` - maintained route/handoff coverage
- `components/README.md` - shared UI inventory
- `docs/DEPLOYMENT.md` - compatible rollout, recovery, and smoke-test runbook
- `supabase/README.md` - ordered migration and database operations guide
