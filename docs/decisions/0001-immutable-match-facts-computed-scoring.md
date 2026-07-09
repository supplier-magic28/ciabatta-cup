# ADR-0001: Store match results as immutable facts; compute scoring from them

- **Status:** Accepted
- **Date:** 2026-07-09

## Context

The Ciabatta Cup ranks ~10 friends across a tennis tournament. The scoring
formula (how a match translates into points and rankings) is the single piece
of logic we expect to change repeatedly — season to season, and while we tune
it. We need to be able to change it fearlessly, without rewriting or migrating
historical data, and we want all-time ranked and exhibition records to come out
for free.

Two broad options:

1. **Store computed state** (each player's points/rank) and update it as matches
   come in. Fast to read, but every formula change requires re-deriving or
   migrating stored history, and the raw truth of "what actually happened" gets
   entangled with a particular scoring era.
2. **Store only the raw facts** and compute everything else on demand.

## Decision

We store **match results as immutable facts** — e.g. "A beat B, 6–3 6–4, ranked,
on this date". A match fact, once written, is never mutated.

Points, standings, and rankings are **never stored**. They are **computed** from
the set of match facts by a single pure function,
`computeRankings(matches) → standings`, isolated in `lib/scoring/`.

*Where* that computation runs (on read now; cached or materialised later if ever
measured to be necessary) is a swappable decision behind the `lib/scoring/`
seam, not part of this decision.

## Consequences

- **The scoring formula can evolve without data migrations.** Changing the
  formula changes one pure function; history is untouched because history is
  just facts.
- **Ranked vs exhibition and all-time records are free** — they are filtered
  views over the same immutable facts, not separately maintained tables.
- **Scoring becomes the test spine.** Because the function is pure and changes
  often, it carries the project's highest-value unit tests (Vitest); a formula
  change instantly surfaces every standing that moved. See `lib/scoring/`.
- **Reads compute from raw matches.** At ~10 users this is a non-problem. If a
  measured performance issue ever appears, we add caching/materialisation behind
  the seam and record it in a new ADR — never speculatively.
- Corrections to a match are modelled as new facts (e.g. a superseding/voided
  entry), never by editing an existing fact.
