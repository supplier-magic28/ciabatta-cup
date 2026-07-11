import { UNRANKED_POINTS } from "./constants";
import { START_RATING } from "./constants";
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
  tournament_id: string | null;
}

export interface TournamentPlacementRow {
  player_id: string;
  points: number;
  awarded_at: string;
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
    tournamentId: row.tournament_id,
  }));
}

/**
 * Compute the complete, rebuildable cache for a known player roster, combining
 * ordinary-match Elo with derived tournament placement awards.
 *
 * The scoring engine derives its roster from match facts. The database also has
 * players who have never logged a match, so seed those known ids at zero here.
 * This function remains pure so both the database writer and read surfaces use
 * exactly the same interpretation of the facts.
 */
export function buildRatingCache(playerIds: string[], rows: ScoringMatchRow[], awards: TournamentPlacementRow[] = []): RatingCache {
  const computed = computeRankings(toScoringMatches(rows));
  const computedByPlayer = new Map(computed.rankings.map((ranking) => [ranking.playerId, ranking]));
  const roster = [...new Set(playerIds)];

  const awardByPlayer = new Map<string, number>();
  for (const award of awards) awardByPlayer.set(award.player_id, (awardByPlayer.get(award.player_id) ?? 0) + award.points);
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
    .map((ranking) => {
      const award = awardByPlayer.get(ranking.playerId) ?? 0;
      return award > 0
        ? { ...ranking, rating: (ranking.rating || START_RATING) + award }
        : ranking;
    })
    .sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId))
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }));

  const reigns = computed.reigns.map((reign) => ({ ...reign }));
  const holderId = rankings.find((ranking) => ranking.rating > 0)?.playerId;
  const currentHolder = reigns.at(-1);
  if (holderId && currentHolder?.playerId !== holderId) {
    const awardedAt = awards.map((award) => award.awarded_at).sort().at(-1) ?? new Date(0).toISOString();
    if (currentHolder) currentHolder.endedAt = awardedAt;
    reigns.push({ playerId: holderId, startedAt: awardedAt, endedAt: null });
  }
  return {
    rankings,
    ratingHistory: computed.ratingHistory,
    reigns,
    ratingPoints: rankings.map(({ playerId, rating }) => ({ playerId, rating })),
  };
}
