# STATUS — Ciabatta Cup

_Short, disposable handover. Updated every session (see the Definition of Done
in `CLAUDE.md`). For vision and how-we-build, read `ARCHITECTURE.md`._

**Last updated:** 2026-07-10

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
- **Phase 3a — match-facts schema + RLS (COMPLETE):**
  - **`matches` / `match_sets` / `match_confirmations`**
    (`20260710000000_matches_spine.sql`): enums (`match_type`, `match_format`,
    `match_status`), integrity checks (submitter/winner are participants,
    approved ⇒ has winner, custom-only `format_note`, paired tiebreaks), and RLS
    reusing `is_admin()` (all read approved; participants read/submit/confirm own;
    admins approve/query/reject; submitter edits own non-approved).
  - **Immutable-facts guard (ADR-0001)** via triggers, mirroring the players
    pattern: `enforce_match_immutable()` seals a match once `approved`, and
    `enforce_parent_match_immutable()` seals its sets/confirmations too — with a
    **deliberate no-backend-exemption** difference from the players guard. **ADR-0006.**
  - `tournament_id`/`fixture_id` are nullable plain-uuid columns (FKs added when
    those tables land). **File-only — NOT yet applied to Supabase** (see caveats).
  - Out of scope by design: no Elo, no UI, no lifecycle-transition automation.

## Next up — Phase 3b/3c

1. **Real scoring formula (3b)** — replace the `computeRankings` stub with Elo
   (K=32, floor 100, start 1000; ranked + approved only), aligned to the match
   fact shape. **Write the tests first** (this is the test spine, ADR-0001/0003).
2. **Log-match screen (3c)** (design screen 03: matchup → type → format → per-set
   scores → submit for approval) + the confirm/approve surfaces. This phase also
   wires the **deferred lifecycle transitions** the schema supports but does not
   automate: auto-confirm the submitter, both-confirmed ⇒ `pending_approval`,
   exhibition auto-approve (ADR-0006).

Decisions along the way (e.g. how approval writes `rating_history`) get an ADR.

## Known issues / caveats

- `computeRankings` is still a **placeholder** (ranks by raw win count), not the
  real formula — the first thing Phase 3b's scoring step replaces.
- **Phase 3a migration is file-only — not applied to Supabase yet.** Apply
  `20260710000000_matches_spine.sql` (CLI `supabase db push` or the SQL editor)
  before any match code runs against the live DB.
- Match **lifecycle transitions are not automated** (deferred to 3c, ADR-0006):
  confirmations are recorded, but nothing yet flips `pending_confirmation →
  pending_approval` or auto-approves exhibitions.
- Tables that still don't exist: `tournaments`, `tournament_participants`,
  `fixtures`, `rating_history`, `ciabatta_reigns`, `activity_log`.
- **Not deployed:** no hosting connected — pushing to `main` does not publish a
  site. Vercel setup (+ env vars) is still pending when a live URL is wanted;
  it does not block Phase 3.
