import type { Match, Standing } from "./types";

/**
 * Compute standings from the full set of match facts.
 *
 * This is the one piece of logic guaranteed to change repeatedly, so it is kept
 * pure and isolated (ARCHITECTURE.md §3, ADR-0001):
 *   - no I/O and no side effects;
 *   - the input array and its elements are never mutated;
 *   - output depends only on the input.
 *
 * ⚠️ PLACEHOLDER FORMULA — NOT FINAL.
 * The real formula (points, ranked vs exhibition weighting, tie-breaks) is not
 * designed yet. For now we rank by raw win count so the module and its test
 * pattern exist. When the real formula lands, update the tests first.
 *
 * The real signature will align to the data model in `docs/SCHEMA.md` (match
 * facts with `type`/`status`/per-set scores) and the Elo points system; it
 * materialises into `rating_history` / `rating_points` (ADR-0003).
 */
export function computeRankings(matches: Match[]): Standing[] {
  const byPlayer = new Map<string, Standing>();

  const ensure = (playerId: string): Standing => {
    let s = byPlayer.get(playerId);
    if (!s) {
      s = { playerId, rank: 0, played: 0, won: 0, lost: 0 };
      byPlayer.set(playerId, s);
    }
    return s;
  };

  for (const match of matches) {
    const winner = ensure(match.winnerId);
    winner.played += 1;
    winner.won += 1;

    const loser = ensure(match.loserId);
    loser.played += 1;
    loser.lost += 1;
  }

  const standings = [...byPlayer.values()].sort(
    (a, b) => b.won - a.won || a.playerId.localeCompare(b.playerId),
  );

  standings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return standings;
}
