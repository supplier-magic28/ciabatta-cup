/**
 * Pure score formatting for match surfaces (confirm / approve lists). Turns the
 * stored `match_sets` rows into a compact human string, player1 first, with any
 * tie-break in parentheses — e.g. `6–4, 7–6 (7–5)`. No I/O, no mutation.
 */

export interface ScoreSet {
  p1Games: number;
  p2Games: number;
  tiebreakP1: number | null;
  tiebreakP2: number | null;
}

const DASH = "–"; // en dash

export function formatScore(sets: ScoreSet[]): string {
  return sets
    .map((set) => {
      const games = `${set.p1Games}${DASH}${set.p2Games}`;
      if (set.tiebreakP1 != null && set.tiebreakP2 != null) {
        return `${games} (${set.tiebreakP1}${DASH}${set.tiebreakP2})`;
      }
      return games;
    })
    .join(", ");
}
