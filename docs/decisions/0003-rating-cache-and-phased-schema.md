# ADR-0003: Rating points are a rebuildable cache; schema built in phases

- **Status:** Accepted (refines ADR-0001; does not supersede it)
- **Date:** 2026-07-09

## Context

Two things surfaced while reconciling the design handoff `SCHEMA.md` with our
architecture:

1. **Apparent conflict with ADR-0001.** ADR-0001 says points and rankings are
   *never stored* — always computed from immutable match facts by a pure
   function. But `SCHEMA.md` defines `players.rating_points`, a `rating_history`
   table, and `ciabatta_reigns` — all of which persist derived scoring data.
2. **Schema size.** The full model is ~9 interrelated tables (matches, sets,
   confirmations, tournaments, participants, fixtures, rating history, reigns,
   activity log). Building it all at once would be premature and hard to review.

## Decision

**1. Derived scoring data is persisted only as a rebuildable cache/materialisation.**
The layering is explicit:

- **Match facts (`matches` + `match_sets`) are the single source of truth** —
  immutable and append-only, exactly as ADR-0001 requires.
- **`rating_history` is a persisted *materialisation*** of the pure scoring
  function over approved ranked matches. It exists for audit, movement arrows,
  and read performance, but is fully **rebuildable** by recomputing forward from
  match facts.
- **`rating_points` is a denormalised cache** of a player's latest
  `rating_history` entry — **rebuildable** from `rating_history`.

Neither `rating_history` nor `rating_points` is authoritative over match facts;
both may be dropped and recomputed. The pure function in `lib/scoring/` is what
produces them, so ADR-0001's "change the formula fearlessly" seam is preserved —
this refines ADR-0001 rather than reversing it.

**2. Build the schema in phases**, one reviewable migration per phase:

- **Phase 2 (this ADR): `players` spine only** — table + RLS. No other tables.
- Later phases, in order: `matches` / `match_sets` / `match_confirmations`;
  `tournaments` / `tournament_participants` / `fixtures`; `rating_history` /
  `ciabatta_reigns`; `activity_log`.

## Consequences

- ADR-0001's guarantee holds: a formula change means re-running the pure function
  and rebuilding `rating_history` + `rating_points` from facts — no lost history.
- The `lib/scoring/computeRankings` stub is provisional. Its real signature will
  align to match facts (`type`, `status`, per-set scores) and Elo when the
  matches phase lands; the tests pin the *pattern* until then.
- `authoritative` data model lives in `docs/SCHEMA.md`; the `_(later phase)_`
  tags there track what is and isn't built.
- Each phase is a small, self-contained migration + ADR, keeping reviews and CI
  cheap.
