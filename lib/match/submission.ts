import type {
  MatchFormat,
  MatchSubmission,
  MatchType,
  SetScore,
  ValidatedSet,
  ValidationResult,
} from "./types";

/**
 * Pure validation + winner derivation for a match submission (ADR-0008).
 *
 * It mirrors the DB constraints (docs/SCHEMA.md, migration
 * 20260710000000_matches_spine.sql) so users get friendly errors instead of raw
 * database rejections, and derives the winner from the set scores — the winner
 * is a *submitted fact*, not a computed rating. No I/O, no scoring, no mutation
 * of the input; shared by the client form (instant feedback) and the server
 * action (never trust the client).
 */

const MATCH_TYPES: readonly MatchType[] = ["ranked", "exhibition"];
const MATCH_FORMATS: readonly MatchFormat[] = ["one_set", "best_of_3", "pro_set_8", "custom"];

/** Sane bounds — not tennis rules, just "this is a plausible score". */
const MAX_GAMES = 30;
const MAX_TIEBREAK = 99;
const MAX_SETS = 7;

/** Who won a single set: on games, or on the tie-break when games are level. */
function setWinner(set: SetScore, selfId: string, opponentId: string): string | null {
  if (set.selfGames > set.opponentGames) return selfId;
  if (set.opponentGames > set.selfGames) return opponentId;
  // Games level — the tie-break decides (if present and not itself a tie).
  if (set.selfTiebreak != null && set.opponentTiebreak != null) {
    if (set.selfTiebreak > set.opponentTiebreak) return selfId;
    if (set.opponentTiebreak > set.selfTiebreak) return opponentId;
  }
  return null;
}

function isGames(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_GAMES;
}

function isTiebreak(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_TIEBREAK;
}

/**
 * Validate a submission from the submitter's perspective (`selfId`) and, on
 * success, return a DB-ready shape with the derived `winnerId`.
 */
export function validateSubmission(input: MatchSubmission, selfId: string): ValidationResult {
  const opponentId = input.opponentId?.trim() ?? "";
  if (!opponentId) return { ok: false, error: "Pick an opponent." };
  if (opponentId === selfId) {
    return { ok: false, error: "You can't log a match against yourself." };
  }

  if (!MATCH_TYPES.includes(input.type)) {
    return { ok: false, error: "Choose ranked or exhibition." };
  }
  if (!MATCH_FORMATS.includes(input.format)) {
    return { ok: false, error: "Choose a match format." };
  }

  // format_note belongs only to `custom` (matches the DB check constraint).
  const note = input.formatNote?.trim() ?? "";
  let formatNote: string | null = null;
  if (input.format === "custom") {
    if (!note) return { ok: false, error: "Describe the custom format." };
    formatNote = note;
  }

  if (input.sets.length === 0) {
    return { ok: false, error: "Add at least one set." };
  }
  if (input.sets.length > MAX_SETS) {
    return { ok: false, error: `A match can have at most ${MAX_SETS} sets.` };
  }

  const sets: ValidatedSet[] = [];
  let selfSetWins = 0;
  let opponentSetWins = 0;

  for (let i = 0; i < input.sets.length; i++) {
    const set = input.sets[i];
    const label = `Set ${i + 1}`;

    if (!isGames(set.selfGames) || !isGames(set.opponentGames)) {
      return { ok: false, error: `${label}: enter game scores between 0 and ${MAX_GAMES}.` };
    }

    const hasSelfTb = set.selfTiebreak != null;
    const hasOpponentTb = set.opponentTiebreak != null;
    if (hasSelfTb !== hasOpponentTb) {
      return { ok: false, error: `${label}: enter both tie-break scores, or neither.` };
    }
    if (hasSelfTb && (!isTiebreak(set.selfTiebreak!) || !isTiebreak(set.opponentTiebreak!))) {
      return { ok: false, error: `${label}: enter valid tie-break scores.` };
    }

    const winner = setWinner(set, selfId, opponentId);
    if (winner === null) {
      return { ok: false, error: `${label} needs a winner — a set can't be a tie.` };
    }
    if (winner === selfId) selfSetWins++;
    else opponentSetWins++;

    sets.push({
      setNumber: i + 1,
      selfGames: set.selfGames,
      opponentGames: set.opponentGames,
      selfTiebreak: set.selfTiebreak,
      opponentTiebreak: set.opponentTiebreak,
    });
  }

  if (selfSetWins === opponentSetWins) {
    return { ok: false, error: "The match needs a clear winner — one player must win more sets." };
  }

  return {
    ok: true,
    value: {
      opponentId,
      type: input.type,
      format: input.format,
      formatNote,
      winnerId: selfSetWins > opponentSetWins ? selfId : opponentId,
      sets,
    },
  };
}
