# Ciabatta Cup

Ciabatta Cup is a private, mobile-first tennis ladder for a small group of
friends. Players submit results, both players confirm them, an admin approves
ranked matches, and the public activity-points ladder is rebuilt from immutable
facts. Ordinary ranked Elo remains a separate derived projection for analysis
and tournament seeding.
Tournament directors can also generate a seeded round-robin draw, record linked
results directly, and advance an event through deciders and placement matches.

The product is intentionally small. The engineering priority is being able to
change the rules, UI, and tournament format without losing confidence in the
history behind the ladder.

## Local development

Requirements: Node.js 20+ and a Supabase project. Use Node.js 24 for the
database-backed authenticated integration test; its Supabase Realtime client
depends on the native WebSocket provided by Node 22 and newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Docker-backed database validation uses the committed Supabase CLI project:

```bash
npm run db:start
npm run db:test
npm run db:lint
```

Keep `.env.local` valid dotenv syntax because the Supabase CLI parses it when
starting the local stack.

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RESEND_API_KEY=
TOURNAMENT_EMAIL_FROM=Ciabatta Cup <cup@example.com>
```

The secret key is server-only. It is required for player invites and for
rebuilding derived ratings when an admin approves a ranked or tournament match.
The Resend key and verified sender are server-only and enable custom match,
practice, planned-match, RSVP, and tournament email. Supabase Auth invite,
confirmation, and recovery mail remains configured through Supabase SMTP.
`NEXT_PUBLIC_SITE_URL` is the canonical origin used in invitation links; the
production value is `https://ciabatta-cup.app`.

Tournament photo submissions are prepared in the browser and sent through a
3 MB Server Action allowance. Keep this bounded pipeline in place: raising the
application limit alone can still exceed the hosting platform request limit.

## Database operations

Migrations are committed under `supabase/migrations/` and must be applied in
filename order. Normally use `supabase db push` after linking the project, or
run the SQL files in the Supabase SQL Editor. The current 127-130 hardening
release is deliberately staged, however: follow [the deployment runbook](docs/DEPLOYMENT.md)
and do not use one plain `db push` to apply all four pending files. The current
migration inventory, invite setup, and first-admin bootstrap instructions live
in [supabase/README.md](supabase/README.md).
After the health migration is applied, organisers can inspect cache drift,
lifecycle integrity, infrastructure contracts, and failed email recovery from
`/admin/health`; the equivalent one-row operator report remains at
`supabase/ops/core_backend_health.sql`.

## Validation

```bash
npm run verify
npm run db:test
npm run db:lint
```

`npm run verify` is the required pre-push aggregate: lint, TypeScript, unit
tests, documentation structure/impact, production build, UI performance
contracts, and browser smoke tests. Run the database commands for schema, RLS,
RPC, or migration work after `npm run db:start`.

CI repeats these checks, applies migrations from scratch, and exercises the
authenticated ranked lifecycle on a disposable Supabase stack. Documentation
checks validate local links, ordered migration and ADR inventories, workflow
IDs, route/component coverage, committed design references, and diff-mapped
updates. The performance contracts protect UI geometry, reduced motion, mobile
overflow, and query shape; they are not latency or bundle-size benchmarks.

## Production

The canonical production origin is `https://ciabatta-cup.app`. Vercel must
serve that domain as the production domain, and Supabase Auth must use the same
origin for its Site URL and invite redirect allow-list. The account-bound DNS,
SMTP, Auth-template, deployment, and smoke-test sequence lives in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

For a release, use the additive/application/enforcement order in the production
runbook. Apply `20260718127000_unified_email_delivery_outbox.sql` before code
that claims the unified outbox, then
`20260718128000_workflow_consistency_hardening.sql` before code that calls the
v2 RSVP, tournament finalisation, active-actor, and health-v4 interfaces. Create
and verify cups from `/admin/tournaments/new`; the event-day procedure is in the
production runbook.

## Documentation map

| Need | Source of truth |
| --- | --- |
| Current capabilities, blockers, and next work | [STATUS.md](STATUS.md) |
| Architecture and engineering practices | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Agent operating instructions and definition of done | [CLAUDE.md](CLAUDE.md) |
| Data model and implementation phase of each entity | [docs/SCHEMA.md](docs/SCHEMA.md) |
| Current lifecycle, approval, notification, email, and mismatch contracts | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| Why a durable technical decision was made and what supersedes it | [docs/decisions/README.md](docs/decisions/README.md) |
| Design handoff coverage and visual source material | [docs/DESIGN.md](docs/DESIGN.md) |
| Supabase setup and migration operations | [supabase/README.md](supabase/README.md) |
| Production deployment and smoke-test steps | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Shared UI vocabulary | [components/README.md](components/README.md) |

Only Git-tracked handoff directories under `design-reference/` are preserved
inputs. Untracked ZIPs and externally missing bundles are noncanonical; promote
durable discoveries into maintained docs, tokens, components, or tests.
