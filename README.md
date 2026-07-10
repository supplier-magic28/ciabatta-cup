# Ciabatta Cup

Ciabatta Cup is a private, mobile-first tennis ladder for a small group of
friends. Players submit results, both players confirm them, an admin approves
ranked matches, and the Elo ladder is rebuilt from the immutable match facts.
Tournament directors can also generate a seeded round-robin draw, record linked
results directly, and advance an event through deciders and placement matches.

The product is intentionally small. The engineering priority is being able to
change the rules, UI, and tournament format without losing confidence in the
history behind the ladder.

## Local development

Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The secret key is server-only. It is required for player invites and for
rebuilding derived ratings when an admin approves a ranked or tournament match.
`NEXT_PUBLIC_SITE_URL` is the canonical origin used in invitation links; the
production value is `https://ciabatta-cup.app`.

## Database operations

Migrations are committed under `supabase/migrations/` and must be applied in
filename order. Use `supabase db push` after linking the project, or run the SQL
files in the Supabase SQL Editor. The current migration inventory, invite setup,
and first-admin bootstrap instructions live in [supabase/README.md](supabase/README.md).

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run docs:check
npm run docs:check:test
npm run build
npm run test:performance
npm run test:e2e
```

CI runs the same checks on every push and pull request. The documentation check
also requires every route in `docs/DESIGN.md`, every shared component in
`components/README.md`, and every migration in `supabase/README.md`. The
performance suite runs after `npm run build`; it exercises pending controls and
responsive loading shells against the compiled production CSS.

## Production

The canonical production origin is `https://ciabatta-cup.app`. Vercel must
serve that domain as the production domain, and Supabase Auth must use the same
origin for its Site URL and invite redirect allow-list. The account-bound DNS,
SMTP, Auth-template, deployment, and smoke-test sequence lives in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

For a tournament release, apply database migrations before deploying routes
that depend on them. Create and verify the draw from `/admin/tournaments/new`;
the event-day procedure is in the production runbook.

## Documentation map

| Need | Source of truth |
| --- | --- |
| Current capabilities, blockers, and next work | [STATUS.md](STATUS.md) |
| Architecture and engineering practices | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Agent operating instructions and definition of done | [CLAUDE.md](CLAUDE.md) |
| Data model and implementation phase of each entity | [docs/SCHEMA.md](docs/SCHEMA.md) |
| Why a durable technical decision was made | [docs/decisions/](docs/decisions/) |
| Design handoff coverage and visual source material | [docs/DESIGN.md](docs/DESIGN.md) |
| Supabase setup and migration operations | [supabase/README.md](supabase/README.md) |
| Production deployment and smoke-test steps | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Shared UI vocabulary | [components/README.md](components/README.md) |

The raw files under `design-reference/` are preserved handoff artifacts. Do not
edit them; record implementation progress in `docs/DESIGN.md` instead.
