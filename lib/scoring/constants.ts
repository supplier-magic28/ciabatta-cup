/**
 * Elo scoring parameters (docs/SCHEMA.md "Points system", ADR-0007).
 *
 * These are deliberately a single source of truth: the group is expected to
 * argue about and rebalance the formula, and because scoring is a pure function
 * of immutable facts (ADR-0001), changing a constant and re-running is all it
 * takes — no data migration.
 */

/** Every player starts here. */
export const START_RATING = 1000;

/** Elo K-factor — the maximum swing from a single evenly-matched result. */
export const K_FACTOR = 32;

/** Ratings are clamped to this hard lower bound. */
export const RATING_FLOOR = 100;

/** Elo divisor: a 400-point gap ⇒ the favourite is expected to score ~0.91. */
export const ELO_DIVISOR = 400;
