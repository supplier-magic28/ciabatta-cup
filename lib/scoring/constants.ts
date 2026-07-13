/**
 * Elo scoring parameters (docs/SCHEMA.md "Points system", ADR-0007).
 *
 * These are deliberately a single source of truth: the group is expected to
 * argue about and rebalance the formula, and because scoring is a pure function
 * of immutable facts (ADR-0001), changing a constant and re-running is all it
 * takes — no data migration.
 */

/** Every player enters ordinary ranked Elo at zero. */
export const START_RATING = 0;

/** Public points before a player has completed an approved ranked match. */
export const UNRANKED_POINTS = 0;

/** Elo K-factor — the maximum swing from a single evenly-matched result. */
export const K_FACTOR = 32;

/** Ratings never display below zero. */
export const RATING_FLOOR = 0;
export const RANKED_PLAY_POINTS = 15;
export const RANKED_WIN_BONUS = 15;
export const UNRANKED_FLAT_POINTS = 10;
export const PRACTICE_POINTS = 5;
export const DECAY_PER_DAY = 1;
export const DROUGHT_7_PENALTY = 10;
export const DROUGHT_30_PENALTY = 30;

/** Elo divisor: a 400-point gap ⇒ the favourite is expected to score ~0.91. */
export const ELO_DIVISOR = 400;
