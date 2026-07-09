# CLAUDE.md — operating instructions for AI sessions

This is the **single source of truth** for how to work in this repo. `AGENTS.md`
points here. Read `ARCHITECTURE.md` for vision and how-we-build; read
`STATUS.md` for current state before starting.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Start-of-session checklist

1. Read `STATUS.md` — what's built, what's next, known issues.
2. Skim `ARCHITECTURE.md` if touching anything architectural.
3. Check `docs/decisions/` for relevant ADRs before changing a settled decision.

## Conventions

- **Knowledge lives in the repo.** Prefer enforced truth (types, tests, schema)
  over prose. Put the *why* in an ADR, the *what next* in `STATUS.md`.
- **Data model authority:** `docs/SCHEMA.md` is the authoritative schema (built
  in phases). Reconcile any change against it and the relevant ADR.
- **Scoring is sacred and pure.** All standings/rankings come from
  `lib/scoring/computeRankings(matches)`. It is a pure function — no I/O, no
  mutation of inputs, no stored points. Match facts are immutable (ADR-0001);
  `rating_history`/`rating_points` are rebuildable caches (ADR-0003).
- **Right-size the effort.** ~10-user app. Leave seams, skip machinery. No
  speculative caching/optimisation — add it only for a *measured* problem,
  recorded in an ADR.
- **UI is token-driven.** Screens are assembled from `components/` primitives
  driven by design tokens (`components/tokens.ts`), not bespoke markup.
- **Commands:** `npm run lint`, `npm run typecheck`, `npm run test`
  (`test:watch` for TDD), `npm run dev`.
- **Secrets:** the publishable key is browser-safe; the secret key never touches
  client code or the repo. Env files (`.env*`) are git-ignored.

## Definition of Done

A task is **not complete** until all of the following hold:

1. **Tests are green.** `npm run lint`, `npm run typecheck`, and
   `npm run test` (Vitest) all pass.
2. **`STATUS.md` is updated** to reflect what changed and what's next.
3. **An ADR is appended** to `docs/decisions/` for any architectural decision
   (never rewrite an old ADR — supersede it).
4. **New pure/consequential logic has tests** — anything scoring-related in
   particular.
5. **The component inventory** (`components/README.md`) is updated if components
   were added or changed.

This mirrors `ARCHITECTURE.md` §6. Following it is what keeps the documentation
system — and the ability to iterate fearlessly — alive.
