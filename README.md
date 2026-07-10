# Ciabatta Cup

Ciabatta Cup is a private, mobile-first tennis ladder for a small group of
friends. Players submit results, both players confirm them, an admin approves
ranked matches, and the Elo ladder is rebuilt from the immutable match facts.

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
```

The secret key is server-only. It is required for player invites and for
rebuilding derived ratings when an admin approves a ranked match.

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
npm run test:e2e
npm run docs:check
```

CI runs the same checks on every push and pull request.

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
