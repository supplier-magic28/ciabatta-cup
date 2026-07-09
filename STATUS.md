# STATUS — Ciabatta Cup

_Short, disposable handover. Updated every session (see the Definition of Done
in `CLAUDE.md`). For vision and how-we-build, read `ARCHITECTURE.md`._

**Last updated:** 2026-07-09

## What's built

- **Phase 0 — scaffold:** Next.js (App Router, TypeScript, Tailwind, ESLint);
  Supabase browser + server clients in `lib/supabase/`; a placeholder landing
  page (`app/page.tsx`) reading "Ciabatta Cup".
- **Phase 0.5 — engineering foundation (this session):**
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

## What's next

- Replace the placeholder scoring formula with the real one (points, ranked vs
  exhibition weighting) — tests first, per ADR-0001.
- Supabase schema + Row Level Security policies for match facts.
- Auth (admin vs player).
- First screens (leaderboard, submit-a-match), assembled from `components/`.

## Known issues / caveats

- `computeRankings` is a **placeholder** (ranks by raw win count), not the real
  formula. Its tests pin the *pattern*, not the final scoring rules.
- No Supabase schema or RLS policies exist yet.
- Design tokens in `components/tokens.ts` are empty placeholders awaiting the
  design handoff.
