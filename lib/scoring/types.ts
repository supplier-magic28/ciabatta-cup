/**
 * Domain types for scoring.
 *
 * A `Match` is an immutable fact (ADR-0001): once recorded it is never mutated.
 * Everything a `Match` implies — ratings, rankings, rating history — is
 * *computed* by the pure `computeRankings` function and is never stored
 * authoritatively (ADR-0001, ADR-0003). Scoring decisions live in ADR-0007.
 */

/** Match lifecycle status — mirrors `public.match_status` in the DB. */
export type MatchStatus =
  | "pending_confirmation"
  | "pending_approval"
  | "approved"
  | "queried"
  | "rejected";

/** Whether a match counts toward ranked points or is exhibition-only. */
export type MatchType = "ranked" | "exhibition" | "unranked_external";

/**
 * An immutable record of a single match, shaped to mirror the `matches` table
 * (docs/SCHEMA.md): the two participants and the winner, not a pre-derived
 * winner/loser pair. Only `type === "ranked"` && `status === "approved"`
 * matches move ratings; the loser is whichever participant is not `winnerId`.
 */
export interface Match {
  /** Stable unique id for the match fact. */
  id: string;
  /** First participant. */
  player1Id: string;
  /** Second participant. */
  player2Id: string;
  /** Winner; one of `player1Id`/`player2Id`. `null` until the match is scored. */
  winnerId: string | null;
  /** Ranked (moves points) or exhibition (record only). */
  type: MatchType;
  /** Lifecycle status; only `approved` matches move ratings. */
  status: MatchStatus;
  /** ISO-8601 timestamp; defines the chronological scoring order. */
  playedAt: string;
  /** Tournament-linked matches are records, but placement awards replace their Elo effect. */
  tournamentId?: string | null;
}

/** A player's computed standing: current rating, rank, and ranked W–L record. */
export interface PlayerRating {
  /** Player id this standing is for. */
  playerId: string;
  /** Current Elo rating, or zero before the first approved ranked result. */
  rating: number;
  /** Internal ordinary-match Elo retained for seeding and history. */
  eloRating?: number;
  /** 1-based rank; 1 = highest rating. Ties break by `playerId` (interim). */
  rank: number;
  /** Ranked + approved matches played. */
  played: number;
  /** Ranked + approved matches won. */
  won: number;
  /** Ranked + approved matches lost. */
  lost: number;
}

/**
 * One rating-history row: the effect a single ranked+approved match had on one
 * participant. Materialises the `rating_history` table (ADR-0003) — but this
 * function only *returns* these; writing them is a later phase.
 */
export interface RatingHistoryEntry {
  /** The approved ranked match that caused this change. */
  matchId: string;
  /** The participant this row is for. */
  playerId: string;
  /** Rating immediately before the match was applied. */
  pointsBefore: number;
  /** Rating immediately after. */
  pointsAfter: number;
  /** Rank (over the full roster) immediately before. */
  rankBefore: number;
  /** Rank immediately after. Powers the ▲/▼ movement arrows. */
  rankAfter: number;
  /** ISO-8601 timestamp of the causing match. */
  playedAt: string;
}

/** A continuous period in which a player held the #1 ranked position. */
export interface CiabattaReign {
  /** Player holding the Ciabatta for this period. */
  playerId: string;
  /** ISO-8601 time of the ranked result that established the holder. */
  startedAt: string;
  /** ISO-8601 time the next holder took over; null for the current reign. */
  endedAt: string | null;
}

/** The full computed result: the current ladder plus the history that built it. */
export interface ScoringResult {
  /** Every rostered player, sorted by rank (rating desc, then playerId). */
  rankings: PlayerRating[];
  /** Two entries per ranked+approved match, in chronological application order. */
  ratingHistory: RatingHistoryEntry[];
  /** Rebuildable #1-holder periods, beginning with the first scored match. */
  reigns: CiabattaReign[];
}

export interface DecayWatch {
  daysSinceLastTennis: number;
  decayedSoFar: number;
  daysUntil7DayFine: number;
  daysUntil30DayFine: number;
  playedToday: boolean;
}
