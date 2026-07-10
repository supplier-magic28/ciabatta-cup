import { UNRANKED_POINTS } from "./constants";
import { computeRankings } from "./computeRankings";
import type {
  CiabattaReign,
  Match,
  MatchStatus,
  MatchType,
  PlayerRating,
  RatingHistoryEntry,
} from "./types";

/** The subset of a `matches` row the pure scoring engine needs. */
export interface ScoringMatchRow {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  type: MatchType;
  status: MatchStatus;
  played_at: string;
}

export interface RatingCache {
  rankings: PlayerRating[];
  ratingHistory: RatingHistoryEntry[];
  reigns: CiabattaReign[];
  ratingPoints: Array<{ playerId: string; rating: number }>;
}

/** Map database naming to the lossless input contract of `computeRankings`. */
export function toScoringMatches(rows: ScoringMatchRow[]): Match[] {
  return rows.map((row) => ({
    id: row.id,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    winnerId: row.winner_id,
    type: row.type,
    status: row.status,
    playedAt: row.played_at,
  }));
}

/**
 * Compute the complete, rebuildable cache for a known player roster.
 *
 * The scoring engine derives its roster from match facts. The database also has
 * players who have never logged a match, so seed those known ids at zero here.
 * This function remains pure so both the database writer and read surfaces use
 * exactly the same interpretation of the facts.
 */
export function buildRatingCache(playerIds: string[], rows: ScoringMatchRow[]): RatingCache {
  const computed = computeRankings(toScoringMatches(rows));
  const computedByPlayer = new Map(computed.rankings.map((ranking) => [ranking.playerId, ranking]));
  const roster = [...new Set(playerIds)];

  const rankings = roster
    .map((playerId) =>
      computedByPlayer.get(playerId) ?? {
        playerId,
        rating: UNRANKED_POINTS,
        rank: 0,
        played: 0,
        won: 0,
        lost: 0,
      },
    )
    .sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId))
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }));

  return {
    rankings,
    ratingHistory: computed.ratingHistory,
    reigns: computed.reigns,
    ratingPoints: rankings.map(({ playerId, rating }) => ({ playerId, rating })),
  };
}
