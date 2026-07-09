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
- **Phase 2 — players spine:**
  - Design handoff landed in `design-reference/`. Reconciled it into
    **`docs/SCHEMA.md`** as the authoritative, phased data model.
  - **ADR-0002** (Supabase Auth for identity; dropped `password_hash`;
    `players.id` → `auth.users.id`) and **ADR-0003** (`rating_points` is a
    rebuildable cache; schema built in phases; refines ADR-0001).
  - **`players` table + RLS** migration
    (`supabase/migrations/20260709000000_players_spine.sql`): enums,
    `is_admin()` helper, policies (read all / update own / admin all), and a
    trigger blocking non-admins from editing privileged columns.
- **Phase 2 — authentication (this session):**
  - **Supabase Auth** (email + password) on the existing `@supabase/ssr`
    clients: sign-up, log-in, log-out (`lib/auth/actions.ts`), session refresh +
    protected-route gating in `proxy.ts` (Next 16's renamed middleware).
  - **`handle_new_user` trigger** auto-creates the `players` profile on signup;
    privilege guard widened for self `invited → active`
    (`supabase/migrations/20260709010000_handle_new_user.sql`). **ADR-0004.**
  - **Sign-in / sign-up screens** rebuilt as real token-driven components from
    design screen 05 (`app/(auth)/…`, `components/{brand,ui,auth}/…`);
    `/auth/confirm` route for email confirmation.
  - **Protected placeholder landing** (`app/page.tsx`): "logged in as {name}" +
    log out. Design tokens filled in (`app/globals.css`, `components/tokens.ts`,
    brand fonts).
  - **Admin-bootstrap fix** (`20260709020000_guard_exempt_backend.sql`,
    **ADR-0005**): the privilege guard is a trigger, so the service role / SQL
    editor did not bypass it — blocking the first-admin seed. Guard now exempts
    backend contexts (`auth.uid()` null). First-admin steps simplified in
    `supabase/README.md`.

## What's next

- **You:** apply both migrations to Supabase, check the email-confirmation
  setting, and create your admin — steps in `supabase/README.md`.
- **You:** connect the repo to Vercel (+ env vars) to actually deploy.
- Next schema phase: `matches` / `match_sets` / `match_confirmations` (+ RLS).
- Replace the placeholder scoring formula with the real Elo one, aligned to
  `docs/SCHEMA.md` — tests first, per ADR-0001/0003.
- First real screens (leaderboard, submit-a-match).

## Known issues / caveats

- `computeRankings` is a **placeholder** (ranks by raw win count), not the real
  formula. Its tests pin the *pattern*, not the final scoring rules.
- Only the `players` table exists. No matches, tournaments, fixtures,
  rating_history, or activity_log tables yet (later phases).
- Migrations **not applied** in this environment (no DB) and no admin seeded yet;
  the live sign-in flow was not exercised here (routing/rendering were).
- No hosting connected yet — pushing to `main` does not deploy (Vercel setup
  pending).
