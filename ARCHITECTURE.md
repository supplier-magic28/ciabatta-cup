# Ciabatta Cup — Architecture & Operating Model

This is the foundational document for the project. It describes **how we build here** and **how this documentation keeps itself current**. It is written for two readers: future-me, and any Claude Code session working in this repo. Read it before making architectural changes.

---

## 1. Vision & guiding principles (rarely changes)

The Ciabatta Cup is a mobile-first web app for tracking a tennis tournament among ~10 friends. One admin, the rest players. Video-game-inspired branding; the #1 ranked player wears "the Ciabatta" (a bread-loaf badge).

The overriding engineering goal is **fearless iteration**: I should be able to change anything, anytime, and know within seconds whether I broke something. We optimise for *ease of improvement over time*, not for hitting some notion of "perfect" or "done".

Principles:

- **Knowledge lives in the repo, not in anyone's head.** Types hold correct shapes, tests hold correct behaviour, docs hold intent (the *why* and the *what next*). No decision should exist only in a chat log or a memory.
- **Prefer enforced truth over written truth.** If code, types, schema, or a test can express something, let them — don't duplicate it in prose that will drift.
- **Right-size the effort.** This is a 10-user app. Scaling is free (Supabase + Vercel). We do not build machinery we don't need; we leave *seams* so we can add it later cheaply.
- **Leave the seam, skip the machinery.** Where future scale/perf might matter, structure the code so the change is small later — but don't pay for it now.

---

## 2. The self-perpetuating documentation system (the core of this repo)

The problem this solves: docs that fall out of date are worse than no docs. Three mechanisms keep ours current.

### 2a. Layer docs by rate of change
| Doc | Changes | Job |
|---|---|---|
| `ARCHITECTURE.md` (this file) | Rarely | Vision, principles, how we build |
| `docs/decisions/*.md` (ADRs) | Append-only | The dated *why* behind each decision |
| `STATUS.md` | Every session | Short handover: what's built, what's next, known issues |
| `CLAUDE.md` | Occasionally | Operating instructions the AI reads every session |

Never mix these. Fast-changing state lives in `STATUS.md` and is treated as disposable, so it never makes the durable docs feel stale.

### 2b. Decisions are append-only (they structurally can't lie)
Architectural decisions are recorded as **ADRs** in `docs/decisions/`, one short file each: *Context → Decision → Consequences*, dated. **Never rewrite an old ADR.** If we change course, write a new ADR that supersedes it and mark the old one superseded. Because the record only ever accretes, it cannot fall out of date — it preserves the full history of reasoning, which is what future-me and future-Claude-Code need.

### 2c. Docs update as part of "done", not as a chore
`CLAUDE.md` encodes a **definition of done** that requires touching the relevant docs whenever a task completes. Because the AI reads `CLAUDE.md` every session, doc maintenance happens as a *byproduct of the work*, not something left to willpower. This is the recursion: each change improves the docs that frame the next change.

> Honest scope note: "never out of date" is the aspiration. The real target is *cheap to keep current and structurally resistant to rot*. This system gets there with near-zero discipline.

---

## 3. Architecture overview

**Stack:** Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres + Auth + Storage) · Vercel (hosting, preview deploys per PR). GitHub is the source of truth; push → CI → preview → merge → production.

**The data model rule (see ADR-0001 and ADR-0003):** Match results are stored as
**immutable facts** ("A beat B, 6-3 6-4, ranked, on this date"). Standings are
always derived by the pure scoring function from those facts. `rating_history`,
`rating_points`, and `ciabatta_reigns` may be persisted only as fully rebuildable
materialisations; they are never authoritative. This lets the scoring formula evolve without
migrating history and keeps ranked and exhibition records available as filtered
views of the same facts.

**Scoring is an isolated pure function** in `lib/scoring/` — `computeRankings(matches) → standings`. It is the one piece of logic guaranteed to change repeatedly, so it is kept pure, isolated, and well-tested. The current cache materialisation is rebuilt from the function after approval; read surfaces still derive standings through the same seam.

**Data fetching** defaults to Server Components (App Router default). Independent
reads begin together, and relational data needed by one read model is embedded
in that query instead of fetched in a dependent wave. App Router loading
boundaries stream route-shaped skeletons while the server completes. **Images**
(avatars/photos) go through Supabase Storage + Next `<Image>` — the only heavy
asset, so worth doing right from the start.

**UI is built from a small component vocabulary** (`components/`) driven by design tokens. Screens are assembled from shared primitives (Button, Card, `RankBadge`, Ciabatta badge, StatBlock, …). This is both what makes the UX feel consistent and what makes visual change cheap (edit a token, everything updates). Player-owned presentation settings are persisted on the profile row, while public labels are derived through the shared display-name helper. The component inventory is kept current per the definition of done.

**Security:** Supabase Row Level Security is on by default; every table is locked until an explicit policy grants access. The publishable key is browser-safe; the secret key never touches client code or the repo.

---

## 4. Testing strategy — a scalpel, not a blanket

We deliberately **do not** pursue comprehensive coverage. We test the few things that are high-leverage: easy to get wrong, painful if broken, central.

- **Scoring function — the test spine.** Because it's pure and changes constantly, it gets a solid battery of unit tests (Vitest). This is what makes rewriting the formula fearless: tests instantly flag any ranking that changed unexpectedly. Highest-value tests in the project.
- **Critical happy-path smoke tests** (Playwright, added once screens exist): e.g. log in → see leaderboard; submit a match. A handful, not exhaustive.
- Everything else: rely on TypeScript + lint. Don't write tests for the sake of coverage.

**CI (GitHub Actions):** lint, typecheck, Vitest, documentation checks, a
production build, Playwright performance budgets, and browser smoke tests run on
every push and PR. Combined with Vercel's per-PR preview deploys, the loop is:
push → checks green → eyeball preview → merge → auto-deploy. Deployments get
*safer and more automated* over time without extra effort.

---

## 5. Performance principles

At this scale, performance is a non-problem unless we do something pathological. The three defaults that matter:

1. **Fetch on the server** (Server Components), start independent reads
   together, and embed child rows needed by the same read model.
2. **Optimise images** (Next `<Image>` + Supabase Storage) — the one heavy asset.
3. **Acknowledge work immediately** with stable pending controls and
   route-shaped loading boundaries, without optimistically changing immutable
   facts.
4. **Keep scoring swappable** — materialised ratings remain rebuildable from
   raw matches, and approval does not report success until the rebuild finishes.

Do not add caching, edge tricks, indexes, or background jobs speculatively. Add
them only in response to a *measured* problem, recorded in an ADR. Browser
budgets enforce stable loading and pending UI against compiled production CSS;
see ADR-0017.

---

## 6. Definition of done (mirrored in CLAUDE.md)

A task is not complete until:

1. Lint, typecheck, Vitest, and `docs:check` all pass.
2. `STATUS.md` reflects what changed and what's next.
3. An **ADR is appended** if any architectural decision was made.
4. The **component inventory** in this file (or `components/README`) is updated if components were added.
5. New logic that is pure and consequential (anything scoring-related) has tests.

Following this is what keeps the documentation system — and therefore the ability to improve this app forever — alive.

## 6a. Documentation impact matrix

| When work changes | Update before completion |
|---|---|
| Schema, RLS, migration, or security | `docs/SCHEMA.md`, `supabase/README.md`, and an ADR for a durable decision |
| Current product workflow or blocker | `STATUS.md`, plus `docs/DESIGN.md` for a handoff screen |
| Shared UI component, token, or visual pattern | `components/README.md` and `docs/DESIGN.md` |
| Setup, environment, deployment, or operator process | Root `README.md` and/or `supabase/README.md` |

This is intentionally a small matrix. It makes the documentation update a
predictable part of every implementation task instead of a separate cleanup.

---

## 7. Document map

- `ARCHITECTURE.md` — this file (vision, how we build)
- `docs/SCHEMA.md` — authoritative data model and implementation phase of each entity
- `docs/decisions/` — ADRs (append-only decision history); `ADR-0001` = immutable-facts + computed-scoring
- `STATUS.md` — current handover (what's built, what's next, known issues)
- `docs/DESIGN.md` — maintained implementation coverage for the immutable design handoff
- `docs/DEPLOYMENT.md` — account-bound production rollout and smoke-test runbook
- `CLAUDE.md` — operating instructions + definition of done for AI sessions
- `lib/scoring/` — the pure scoring function + its tests
- `components/` — the shared UI vocabulary + design tokens
