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
- **Phase 2 — players spine + authentication (COMPLETE):**
  - Design handoff landed in `design-reference/`. Reconciled it into
    **`docs/SCHEMA.md`** as the authoritative, phased data model.
  - **`players` table + RLS** (`20260709000000_players_spine.sql`): enums,
    `is_admin()` helper, policies (read all / update own / admin all), and a
    trigger freezing privileged columns. **ADR-0002** (Supabase Auth; dropped
    `password_hash`; `players.id` → `auth.users.id`), **ADR-0003** (rating is a
    rebuildable cache; phased schema).
  - **Supabase Auth** (email + password) on the `@supabase/ssr` clients:
    sign-up / log-in / log-out (`lib/auth/actions.ts`), session refresh +
    protected-route gating in `proxy.ts`. **`handle_new_user` trigger**
    auto-creates the profile on signup; self `invited → active` allowed
    (`20260709010000_handle_new_user.sql`). **ADR-0004.**
  - **Sign-in / sign-up screens** as real token-driven components from design
    screen 05 (`app/(auth)/…`, `components/{brand,ui,auth}/…`); `/auth/confirm`
    route; protected placeholder landing (`app/page.tsx`, "logged in as {name}").
    Design tokens + brand fonts wired (`app/globals.css`, `components/tokens.ts`).
  - **Admin-bootstrap fix** (`20260709020000_guard_exempt_backend.sql`,
    **ADR-0005**): guard exempts backend contexts (`auth.uid()` null).
  - **Applied & live on Supabase:** all three migrations run; **first admin
    (`ringo@spectoolbox.com`) seeded** and auth flow working end-to-end.

## Next up — Phase 3: matches (tomorrow's pickup point)

The goal of Phase 3 is turning real match results into data. Suggested order,
per `docs/SCHEMA.md` and the append-only / tests-first conventions:

1. **Schema + RLS migration** for the match facts (casual matches first;
   `tournament_id` / `fixture_id` stay nullable until the tournaments phase):
   - `matches` — `type` (ranked/exhibition), `format`, `player1_id`/`player2_id`,
     `winner_id`, `status` lifecycle (`pending_confirmation → pending_approval →
     approved | queried | rejected`), `submitted_by`, `played_at`.
   - `match_sets` — per-set games + tiebreak.
   - `match_confirmations` — one row per participant; both present ⇒
     `pending_approval`.
   - RLS: participants submit/confirm their own; **admins** approve/query.
     Matches are **immutable facts** once recorded (ADR-0001) — corrections are
     new facts, not edits.
2. **Real scoring formula** — replace the `computeRankings` stub with Elo
   (K=32, floor 100, start 1000; ranked + approved only), aligned to the match
   fact shape. **Write the tests first** (this is the test spine, ADR-0001/0003).
3. **Log-match screen** (design screen 03: matchup → type → format → per-set
   scores → submit for approval) + the confirm/approve surfaces.

Decisions along the way (e.g. how approval writes `rating_history`) get an ADR.

## Known issues / caveats

- `computeRankings` is still a **placeholder** (ranks by raw win count), not the
  real formula — the first thing Phase 3's scoring step replaces.
- Only the `players` table exists. No matches, sets, confirmations, tournaments,
  fixtures, rating_history, or activity_log tables yet.
- **Not deployed:** no hosting connected — pushing to `main` does not publish a
  site. Vercel setup (+ env vars) is still pending when a live URL is wanted;
  it does not block Phase 3.
