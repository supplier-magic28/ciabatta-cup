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
import { computeActivityPoints, deriveActivityReigns, type PlayDayFact, type PracticeFact } from "./activityPoints";
import type { DecayWatch } from "./types";

/** The subset of a `matches` row the pure scoring engine needs. */
export interface ScoringMatchRow {
  id: string;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  type: MatchType;
  status: MatchStatus;
  played_at: string;
  tournament_id: string | null;
}

export type ScoringMatchWithEvent = ScoringMatchRow & {
  tournaments?: { starts_at: string } | Array<{ starts_at: string }> | null;
};

export interface TournamentPlacementRow {
  player_id: string;
  points: number;
  awarded_at: string;
}

export type TournamentPlacementWithEvent = TournamentPlacementRow & {
  tournaments?: { starts_at: string } | Array<{ starts_at: string }> | null;
};

/** Use the event date for historical replay, including legacy late-created awards. */
export function normalizeTournamentPlacementDates<T extends TournamentPlacementWithEvent>(rows: T[]): Array<Omit<T, "tournaments">> {
  return rows.map(({ tournaments, ...row }) => {
    const tournament = Array.isArray(tournaments) ? tournaments[0] : tournaments;
    return { ...row, awarded_at: tournament?.starts_at ?? row.awarded_at };
  });
}

/** Use the single-day cup start for activity replay without rewriting match facts. */
export function normalizeTournamentMatchDates<T extends ScoringMatchWithEvent>(rows: T[]): Array<Omit<T, "tournaments">> {
  return rows.map(({ tournaments, ...row }) => {
    const tournament = Array.isArray(tournaments) ? tournaments[0] : tournaments;
    return { ...row, played_at: row.tournament_id ? (tournament?.starts_at ?? row.played_at) : row.played_at };
  });
}

export interface RatingCache {
  rankings: PlayerRating[];
  ratingHistory: RatingHistoryEntry[];
  reigns: CiabattaReign[];
  ratingPoints: Array<{ playerId: string; rating: number }>;
  decayWatches: Map<string, DecayWatch>;
  eloRatings: Map<string, number>;
  activityTimelines: Map<string, import("./activityPoints").ActivityPointEvent[]>;
  activityLedgers: Map<string, import("./activityPoints").ActivityLedgerEntry[]>;
}

/** Map database naming to the lossless input contract of `computeRankings`. */
export function toScoringMatches(rows: ScoringMatchRow[]): Match[] {
  return rows.filter((row): row is ScoringMatchRow & { player2_id: string } => row.player2_id !== null).map((row) => ({
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
 * Compute both rebuildable scoring projections for a known player roster:
 * public activity points (matches, placements, practice, play days, and decay)
 * plus the separate ordinary-ranked Elo history.
 *
 * The scoring engine derives its roster from match facts. The database also has
 * players who have never logged a match, so seed those known ids at zero here.
 * This function remains pure so the cache writer, ladder, profile, and Elo
 * projection all interpret the same canonical facts consistently.
 */
export function buildRatingCache(playerIds: string[], rows: ScoringMatchRow[], awards: TournamentPlacementRow[] = [], practices: PracticeFact[] = [], playDays: PlayDayFact[] = [], asOfDate = latestActivityDate(rows, awards, practices, playDays)): RatingCache {
  const computed = computeRankings(toScoringMatches(rows));
  const computedByPlayer = new Map(computed.rankings.map((ranking) => [ranking.playerId, ranking]));
  const roster = [...new Set(playerIds)];

  const activity = computeActivityPoints(playerIds, rows, awards, practices, playDays, asOfDate);
  const reigns = deriveActivityReigns(roster, activity.timelines);
  const holderId = reigns.at(-1)?.playerId ?? null;
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
      return { ...ranking, rating: activity.points.get(ranking.playerId) ?? 0 };
    })
    .sort((a, b) => b.rating - a.rating
      || (a.playerId === holderId ? -1 : b.playerId === holderId ? 1 : a.playerId.localeCompare(b.playerId)))
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  const externalHistory: RatingHistoryEntry[] = [];
  const externalApplied = new Map<string, number>();
  const rankByPlayer = new Map(rankings.map((ranking) => [ranking.playerId, ranking.rank]));
  for (const match of rows
    .filter((row) => row.type === "unranked_external" && row.status === "approved")
    .slice()
    .sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id.localeCompare(b.id))) {
    const totalExternal = rows.filter((row) => row.type === "unranked_external" && row.status === "approved" && row.player1_id === match.player1_id).length * 10;
    const finalPoints = rankings.find((ranking) => ranking.playerId === match.player1_id)?.rating ?? 0;
    const applied = externalApplied.get(match.player1_id) ?? 0;
    const pointsBefore = finalPoints - totalExternal + applied;
    const rank = rankByPlayer.get(match.player1_id) ?? 1;
    externalHistory.push({ matchId: match.id, playerId: match.player1_id, pointsBefore, pointsAfter: pointsBefore + 10, rankBefore: rank, rankAfter: rank, playedAt: match.played_at });
    externalApplied.set(match.player1_id, applied + 10);
  }
  const ordinaryHistory: RatingHistoryEntry[] = [];
  const ordinaryApplied = new Map<string, number>();
  for (const match of rows.filter((row) => row.status === "approved" && row.tournament_id == null && row.type !== "unranked_external").slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id.localeCompare(b.id))) {
    for (const playerId of [match.player1_id, match.player2_id].filter((id): id is string => id !== null)) {
      const award = match.type === "ranked" ? 15 + (match.winner_id === playerId ? 15 : 0) : 10;
      const before = ordinaryApplied.get(playerId) ?? 0;
      const rank = rankByPlayer.get(playerId) ?? 1;
      ordinaryHistory.push({ matchId: match.id, playerId, pointsBefore: before, pointsAfter: before + award, rankBefore: rank, rankAfter: rank, playedAt: match.played_at });
      ordinaryApplied.set(playerId, before + award);
    }
  }
  return {
    rankings,
    ratingHistory: [...ordinaryHistory, ...externalHistory].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.matchId.localeCompare(b.matchId)),
    reigns,
    ratingPoints: rankings.map(({ playerId, rating }) => ({ playerId, rating })),
    decayWatches: activity.watches,
    eloRatings: new Map(computed.rankings.map((ranking) => [ranking.playerId, ranking.rating])),
    activityTimelines: activity.timelines,
    activityLedgers: activity.ledgers,
  };
}

function latestActivityDate(rows: ScoringMatchRow[], awards: TournamentPlacementRow[], practices: PracticeFact[], playDays: PlayDayFact[]): string {
  return [...rows.filter((row) => row.status !== "rejected").map((row) => row.played_at.slice(0, 10)), ...awards.map((row) => row.awarded_at.slice(0, 10)), ...practices.filter((row) => row.status === "approved").map((row) => row.practiced_on), ...playDays.map((row) => row.played_on)].sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}
