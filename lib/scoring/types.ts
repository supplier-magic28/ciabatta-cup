/**
 * Domain types for scoring.
 *
 * A `Match` is an immutable fact (ADR-0001): once recorded it is never mutated.
 * A `Standing` is *computed* from matches and is never stored.
 */

/** An immutable record of a single completed match. */
export interface Match {
  /** Stable unique id for the match fact. */
  id: string;
  /** Player id of the winner. */
  winnerId: string;
  /** Player id of the loser. */
  loserId: string;
  /** Whether this match counts toward ranked standings (vs exhibition). */
  ranked: boolean;
  /** ISO-8601 date the match was played, e.g. "2026-07-09". */
  playedAt: string;
  /** Optional human-readable score, e.g. "6-3 6-4". Not used by scoring yet. */
  score?: string;
}

/** A single row in the computed standings table. */
export interface Standing {
  /** Player id this standing is for. */
  playerId: string;
  /** 1-based rank; ties share the lower rank number (dense within this stub). */
  rank: number;
  /** Matches played (as winner or loser) among the scored set. */
  played: number;
  /** Matches won among the scored set. */
  won: number;
  /** Matches lost among the scored set. */
  lost: number;
}
