import { ELO_DIVISOR, K_FACTOR, RATING_FLOOR, START_RATING } from "./constants";
import type { Match, PlayerRating, RatingHistoryEntry, ScoringResult } from "./types";

/**
 * Compute every player's Elo rating, rank, and the rating history it implies,
 * from the full set of match facts.
 *
 * This is the one piece of logic guaranteed to change repeatedly, so it is kept
 * pure and isolated (ARCHITECTURE.md §3, ADR-0001):
 *   - no I/O and no side effects; the input array and its elements are never
 *     mutated; output depends only on the input;
 *   - it *returns* the `rating_history` data the facts imply — it never writes
 *     to the database (materialising it is a later phase, ADR-0003/0007).
 *
 * Scoring model (ADR-0007):
 *   - Only `type === "ranked"` && `status === "approved"` matches move ratings.
 *   - The roster is every participant of *any* input match; a player with no
 *     ranked+approved match sits at the starting rating.
 *   - Matches are applied in chronological order (`playedAt`, then `id`), so the
 *     result is independent of input array order and a late-approved old match
 *     slots into its correct place on the next run ("recompute forward").
 *   - Standard Elo (K=32, start 1000), each updated rating rounded to an integer
 *     and clamped to the 100 floor. Per-match rounding keeps the history an exact
 *     integer chain (each `pointsBefore` equals the prior `pointsAfter`).
 */
export function computeRankings(matches: Match[]): ScoringResult {
  const ratings = new Map<string, number>();
  const record = new Map<string, { played: number; won: number; lost: number }>();

  // Roster: every participant of every match, seeded at the starting rating.
  for (const match of matches) {
    for (const playerId of [match.player1Id, match.player2Id]) {
      if (!ratings.has(playerId)) {
        ratings.set(playerId, START_RATING);
        record.set(playerId, { played: 0, won: 0, lost: 0 });
      }
    }
  }

  // Scoring set: ranked + approved only, applied chronologically. `slice()` so
  // the caller's array is never reordered.
  const scoringMatches = matches
    .filter((match) => match.type === "ranked" && match.status === "approved")
    .slice()
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));

  const ratingHistory: RatingHistoryEntry[] = [];

  for (const match of scoringMatches) {
    const winnerId = match.winnerId;
    // Trust the facts, but skip anything malformed (an approved match always has
    // a participant winner per the DB constraint) rather than throw.
    if (winnerId == null || (winnerId !== match.player1Id && winnerId !== match.player2Id)) {
      continue;
    }
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    const winnerBefore = ratings.get(winnerId)!;
    const loserBefore = ratings.get(loserId)!;
    const winnerRankBefore = rankOf(ratings, winnerId);
    const loserRankBefore = rankOf(ratings, loserId);

    const expectedWinner = expectedScore(winnerBefore, loserBefore);
    const winnerAfter = nextRating(winnerBefore, 1, expectedWinner);
    const loserAfter = nextRating(loserBefore, 0, 1 - expectedWinner);

    ratings.set(winnerId, winnerAfter);
    ratings.set(loserId, loserAfter);

    const winnerRecord = record.get(winnerId)!;
    winnerRecord.played += 1;
    winnerRecord.won += 1;
    const loserRecord = record.get(loserId)!;
    loserRecord.played += 1;
    loserRecord.lost += 1;

    ratingHistory.push({
      matchId: match.id,
      playerId: winnerId,
      pointsBefore: winnerBefore,
      pointsAfter: winnerAfter,
      rankBefore: winnerRankBefore,
      rankAfter: rankOf(ratings, winnerId),
      playedAt: match.playedAt,
    });
    ratingHistory.push({
      matchId: match.id,
      playerId: loserId,
      pointsBefore: loserBefore,
      pointsAfter: loserAfter,
      rankBefore: loserRankBefore,
      rankAfter: rankOf(ratings, loserId),
      playedAt: match.playedAt,
    });
  }

  const rankings: PlayerRating[] = orderByRating(ratings).map((playerId, index) => {
    const wl = record.get(playerId)!;
    return {
      playerId,
      rating: ratings.get(playerId)!,
      rank: index + 1,
      played: wl.played,
      won: wl.won,
      lost: wl.lost,
    };
  });

  return { rankings, ratingHistory };
}

/** Elo expected score for player A against player B. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / ELO_DIVISOR));
}

/** Apply one Elo update, round to an integer, and clamp to the floor. */
function nextRating(current: number, actual: number, expected: number): number {
  return Math.max(RATING_FLOOR, Math.round(current + K_FACTOR * (actual - expected)));
}

/** Player ids ordered by rating desc, then playerId asc (deterministic ties). */
function orderByRating(ratings: Map<string, number>): string[] {
  return [...ratings.keys()].sort((a, b) => ratings.get(b)! - ratings.get(a)! || a.localeCompare(b));
}

/** 1-based rank of a player within the full roster. */
function rankOf(ratings: Map<string, number>, playerId: string): number {
  return orderByRating(ratings).indexOf(playerId) + 1;
}
