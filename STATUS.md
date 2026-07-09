# STATUS — Ciabatta Cup

_Short, disposable handover. Updated every session (see the Definition of Done
in `CLAUDE.md`). For vision and how-we-build, read `ARCHITECTURE.md`._

**Last updated:** 2026-07-09

## What's built

- **Phase 0 — scaffold:** Next.js (App Router, TypeScript, Tailwind, ESLint);
  Supabase browser + server clients in `lib/supabase/`; a placeholder landing
  page (`app/page.tsx`) reading "Ciabatta Cup".
- **Phase 0.5 — engineering foundation:**
  - Documentation system live: `ARCHITECTURE.md` (foundational),
    `docs/decisions/` with an ADR template + **ADR-0001** (immutable match facts
    + computed scoring), this `STATUS.md`, and `CLAUDE.md` as the operating doc.
  - `CLAUDE.md` is the single source of truth for agent instructions;
    `AGENTS.md` points to it.
  - **Vitest** wired up; `lib/scoring/` created as a pure `computeRankings`
    stub with a unit-test battery establishing the testing pattern.
  - **CI** (`.github/workflows/ci.yml`) runs lint + typecheck + Vitest on every
    push and PR.
  - `components/` + `components/tokens.ts` placeholders ready for design handoff.
- **Phase 2 — players spine (this session):**
  - Design handoff landed in `design-reference/`. Reconciled it into
    **`docs/SCHEMA.md`** as the authoritative, phased data model.
  - **ADR-0002** (Supabase Auth for identity; dropped `password_hash`;
    `players.id` → `auth.users.id`) and **ADR-0003** (`rating_points` is a
    rebuildable cache; schema built in phases; refines ADR-0001).
  - **`players` table + RLS** migration
    (`supabase/migrations/20260709000000_players_spine.sql`): enums,
    `is_admin()` helper, policies (read all / update own / admin all), and a
    trigger blocking non-admins from editing privileged columns.

## What's next

- Apply the migration to the Supabase project and seed the first admin
  (`supabase/README.md`).
- Next schema phase: `matches` / `match_sets` / `match_confirmations` (+ RLS).
- Replace the placeholder scoring formula with the real Elo one, aligned to
  `docs/SCHEMA.md` — tests first, per ADR-0001/0003.
- Auth wiring (sign-in) and first screens (leaderboard, submit-a-match).

## Known issues / caveats

- `computeRankings` is a **placeholder** (ranks by raw win count), not the real
  formula. Its tests pin the *pattern*, not the final scoring rules.
- Only the `players` table exists. No matches, tournaments, fixtures,
  rating_history, or activity_log tables yet (later phases).
- The migration has **not been applied** here (no DB in this environment) and no
  first admin is seeded yet.
- Design tokens in `components/tokens.ts` are empty placeholders awaiting the
  design handoff.
