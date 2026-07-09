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
- **Phase 3b — Elo scoring engine, tests-first (COMPLETE):**
  - `computeRankings` is now the **real Elo engine** (`lib/scoring/`): pure
    function of match facts → `{ rankings, ratingHistory }`. K=32, start 1000,
    100 floor (`constants.ts`); ranked + approved only; roster = every
    participant (exhibition-only players sit at 1000); chronological
    recompute-forward; two `rating_history` entries per scored match with
    points/rank before & after. **Returns** the data — **no DB writes, no UI, no
    reigns.** **ADR-0007.**
  - **10-case test battery written first** (`computeRankings.test.ts`): empty
    input, single win (+16/-16), K/start pinned, gap-weighted underdog win +
    rank flip, exhibition/pending ignored, no-ranked-matches stays at 1000,
    input-order independence, chronological order-dependence, the 100 floor
    invariant, purity. All green.

- **Phase 3c-part-1 — log-match submission (COMPLETE):**
  - **Log-match wizard** (design screen 03) as token-driven components
    (`components/match/LogMatchForm`, new `components/ui/Chip`): 3 steps —
    matchup → type & format → per-set scores with tie-breaks. Linked from the
    home page.
  - **`submitMatch` server action** (`lib/match/actions.ts`): writes `matches`
    (status `pending_confirmation`) + `match_sets` + the submitter's
    `match_confirmations` row, through the user's authenticated client (RLS
    applies), with compensating delete on partial failure. **No auto-approve, no
    scoring, no rating writes.**
  - **Shared pure validation** (`lib/match/submission.ts`, tests-first, 12 cases):
    mirrors the DB constraints for friendly errors; **winner is derived from the
    set scores** (draws rejected). **ADR-0008.**
  - **"Your matches" list** (`app/matches`) shows submitted matches + lifecycle
    status — the minimal "submission is working" surface (not the leaderboard).

## Next up — Phase 3c-part-2 (confirm / approve)

The opponent-confirm and admin approve/query/reject surfaces, wiring the
**deferred lifecycle transitions** the schema supports (both-confirmed ⇒
`pending_approval`, exhibition auto-approve; ADR-0006). Then the **DB adapter**
that feeds approved ranked facts into `computeRankings` and materialises
`rating_history` / the `rating_points` cache, and finally **Ciabatta reigns**.
Decisions (e.g. how approval writes `rating_history`) get an ADR.

Decisions along the way (e.g. how approval writes `rating_history`) get an ADR.

## Known issues / caveats

- `computeRankings` is the real Elo engine but is **not yet wired to the DB**:
  nothing feeds it live match facts and nothing persists its `rating_history` /
  `rating_points` output. That adapter is Phase 3c.
- **Phase 3a migration is file-only — not applied to Supabase yet.** The
  log-match flow (3c-part-1) is code-complete and lint/typecheck/test-green, but
  **cannot run live until `20260710000000_matches_spine.sql` is applied** (CLI
  `supabase db push` or the SQL editor). Not yet verified end-to-end against the
  live DB for that reason.
- Match **lifecycle transitions are not automated** (deferred to 3c, ADR-0006):
  confirmations are recorded, but nothing yet flips `pending_confirmation →
  pending_approval` or auto-approves exhibitions.
- Tables that still don't exist: `tournaments`, `tournament_participants`,
  `fixtures`, `rating_history`, `ciabatta_reigns`, `activity_log`.
- **Not deployed:** no hosting connected — pushing to `main` does not publish a
  site. Vercel setup (+ env vars) is still pending when a live URL is wanted;
  it does not block Phase 3.
