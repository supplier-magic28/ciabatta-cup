import type {
  MatchFormat,
  MatchSubmission,
  MatchType,
  SetScore,
  ValidatedSet,
  ValidationResult,
  ExternalMatchSubmission,
  ExternalValidationResult,
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
const MAX_LOCATION = 160;

function validateDateAndLocation(playedDate: string, locationInput: string) {
  const date = playedDate?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false as const, error: "Choose the date the match was played." };
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return { ok: false as const, error: "Choose a valid match date." };
  const location = locationInput?.trim() ?? "";
  if (location.length > MAX_LOCATION) return { ok: false as const, error: `Location must be ${MAX_LOCATION} characters or fewer.` };
  return { ok: true as const, playedAt: parsed.toISOString(), location: location || null };
}

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
  const details = validateDateAndLocation(input.playedDate, input.location);
  if (!details.ok) return details;

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
      playedAt: details.playedAt,
      location: details.location,
      winnerId: selfSetWins > opponentSetWins ? selfId : opponentId,
      sets,
    },
  };
}

/** Validate the owner-private external variant while reusing all score rules. */
export function validateExternalSubmission(
  input: ExternalMatchSubmission,
  selfId: string,
): ExternalValidationResult {
  const opponentName = input.opponentName?.trim() ?? "";
  if (!opponentName) return { ok: false, error: "Enter your opponent's name." };
  if (opponentName.length > 100) return { ok: false, error: "Opponent name must be 100 characters or fewer." };
  const details = validateDateAndLocation(input.playedDate, input.location);
  if (!details.ok) return details;

  const externalId = "__external_opponent__";
  const result = validateSubmission({
    opponentId: externalId,
    type: "exhibition",
    format: input.format,
    formatNote: input.formatNote,
    playedDate: input.playedDate,
    location: input.location,
    sets: input.sets,
  }, selfId);
  if (!result.ok) return result;

  return {
    ok: true,
    value: {
      opponentName,
      saveOpponent: input.saveOpponent === true,
      format: result.value.format,
      formatNote: result.value.formatNote,
      playedAt: details.playedAt,
      location: details.location,
      externalWon: result.value.winnerId === externalId,
      sets: result.value.sets,
    },
  };
}
