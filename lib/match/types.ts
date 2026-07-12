import type { MatchType } from "@/lib/scoring/types";

/**
 * Types for the log-match submission flow (Phase 3c-part-1). These describe what
 * a player *submits*; the immutable match fact it becomes lives in the `matches`
 * / `match_sets` tables (docs/SCHEMA.md). No scoring here — the winner is a
 * submitted fact derived from the set scores (ADR-0008).
 */

export type { MatchType };

/** Match format — mirrors `public.match_format` in the DB. */
export type MatchFormat = "one_set" | "best_of_3" | "pro_set_8" | "custom";

/** One set as entered on the form: the submitter's games vs the opponent's. */
export interface SetScore {
  /** Games won by the submitter (player1). */
  selfGames: number;
  /** Games won by the opponent (player2). */
  opponentGames: number;
  /** Tie-break points for the submitter, or null if the set had no tie-break. */
  selfTiebreak: number | null;
  /** Tie-break points for the opponent, or null. */
  opponentTiebreak: number | null;
}

/** The full payload the log-match form sends to the submit action. */
export interface MatchSubmission {
  /** The opponent (player2). The submitter is always player1. */
  opponentId: string;
  type: MatchType;
  format: MatchFormat;
  /** Free-text note; only meaningful (and required) when format is `custom`. */
  formatNote: string;
  playedDate: string;
  location: string;
  sets: SetScore[];
}

export interface ExternalMatchSubmission {
  opponentName: string;
  saveOpponent: boolean;
  format: MatchFormat;
  formatNote: string;
  playedDate: string;
  location: string;
  sets: SetScore[];
}

export interface ValidatedExternalSubmission {
  opponentName: string;
  saveOpponent: boolean;
  format: MatchFormat;
  formatNote: string | null;
  playedAt: string;
  location: string | null;
  externalWon: boolean;
  sets: ValidatedSet[];
}

export type ExternalValidationResult =
  | { ok: true; value: ValidatedExternalSubmission }
  | { ok: false; error: string };

/** A validated, DB-ready set row (1-based `setNumber`). */
export interface ValidatedSet {
  setNumber: number;
  selfGames: number;
  opponentGames: number;
  selfTiebreak: number | null;
  opponentTiebreak: number | null;
}

/** A validated submission with the match winner derived from the set scores. */
export interface ValidatedSubmission {
  opponentId: string;
  type: MatchType;
  format: MatchFormat;
  formatNote: string | null;
  playedAt: string;
  location: string | null;
  /** The submitter's id or the opponent's id — never anyone else. */
  winnerId: string;
  sets: ValidatedSet[];
}

export type ValidationResult =
  | { ok: true; value: ValidatedSubmission }
  | { ok: false; error: string };
