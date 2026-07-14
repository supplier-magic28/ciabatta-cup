import type { TournamentRuleset, TournamentScoreValidation, TournamentSetInput } from "./types";

function tiebreakIsValid(winner: number, loser: number): boolean {
  return winner >= 7 && winner - loser >= 2 && (winner === 7 || winner - loser === 2);
}

function validateStandardSet(input: TournamentSetInput): string | null {
  const p1Won =
    (input.p1Games === 6 && input.p2Games <= 4) ||
    (input.p1Games === 7 && [5, 6].includes(input.p2Games));
  const p2Won =
    (input.p2Games === 6 && input.p1Games <= 4) ||
    (input.p2Games === 7 && [5, 6].includes(input.p1Games));
  if (!p1Won && !p2Won) return "Enter a completed full set: 6-0 to 6-4, 7-5, or 7-6.";
  const reachedTiebreak = [input.p1Games, input.p2Games].sort((a, b) => a - b).join(":") === "6:7";
  if (reachedTiebreak) {
    if (input.tiebreakP1 == null || input.tiebreakP2 == null) return "A 7-6 set needs both tie-break scores.";
    const valid = p1Won
      ? tiebreakIsValid(input.tiebreakP1, input.tiebreakP2)
      : tiebreakIsValid(input.tiebreakP2, input.tiebreakP1);
    if (!valid) return "Enter a valid tie-break won by two points.";
  } else if (input.tiebreakP1 != null || input.tiebreakP2 != null) {
    return "Tie-break points belong only to a 7-6 set.";
  }
  return null;
}

export function validateTournamentScore(
  ruleset: TournamentRuleset,
  player1Id: string,
  player2Id: string,
  input: TournamentSetInput | readonly TournamentSetInput[],
): TournamentScoreValidation {
  const sets = Array.isArray(input) ? [...input] : [input as TournamentSetInput];
  if (sets.length === 0 || sets.some((set) => [set.p1Games, set.p2Games].some((value) => !Number.isInteger(value) || value < 0))) {
    return { ok: false, error: "Enter whole, non-negative game scores." };
  }

  if (ruleset === "short_first_to_3") {
    if (sets.length !== 1) return { ok: false, error: "First-to-three requires one score." };
    const input = sets[0];
    if (input.tiebreakP1 != null || input.tiebreakP2 != null) {
      return { ok: false, error: "Short sets do not use a separate tie-break score." };
    }
    const valid =
      (input.p1Games === 3 && input.p2Games <= 2) ||
      (input.p2Games === 3 && input.p1Games <= 2);
    if (!valid) return { ok: false, error: "A short set ends when one player reaches 3 games." };
  } else if (ruleset === "pro_set_8") {
    if (sets.length !== 1) return { ok: false, error: "A pro set requires one score." };
    const set = sets[0];
    const p1Won = (set.p1Games === 8 && set.p2Games <= 6) || (set.p1Games === 9 && [7, 8].includes(set.p2Games));
    const p2Won = (set.p2Games === 8 && set.p1Games <= 6) || (set.p2Games === 9 && [7, 8].includes(set.p1Games));
    if (!p1Won && !p2Won) return { ok: false, error: "Enter a completed pro set: 8-0 to 8-6, 9-7, or 9-8." };
    const tiebreak = Math.max(set.p1Games, set.p2Games) === 9 && Math.min(set.p1Games, set.p2Games) === 8;
    if (tiebreak) {
      if (set.tiebreakP1 == null || set.tiebreakP2 == null) return { ok: false, error: "A 9-8 pro set needs both tie-break scores." };
      const valid = p1Won ? tiebreakIsValid(set.tiebreakP1, set.tiebreakP2) : tiebreakIsValid(set.tiebreakP2, set.tiebreakP1);
      if (!valid) return { ok: false, error: "Enter a valid tie-break won by two points." };
    } else if (set.tiebreakP1 != null || set.tiebreakP2 != null) return { ok: false, error: "Tie-break points belong only to a 9-8 pro set." };
  } else {
    const expected = ruleset === "best_of_3_standard" ? [2, 3] : [1];
    if (!expected.includes(sets.length)) return { ok: false, error: ruleset === "best_of_3_standard" ? "Best of three needs two or three completed sets." : "This format requires one set." };
    for (const set of sets) {
      const error = validateStandardSet(set);
      if (error) return { ok: false, error };
    }
    if (ruleset === "best_of_3_standard") {
      const p1Wins = sets.filter((set) => set.p1Games > set.p2Games).length;
      const p2Wins = sets.length - p1Wins;
      if (Math.max(p1Wins, p2Wins) !== 2) return { ok: false, error: "Best of three requires two set wins." };
      if (sets.length === 3 && (p1Wins === 0 || p2Wins === 0)) return { ok: false, error: "Do not enter a dead third set." };
    }
  }

  const p1Wins = sets.filter((set) => set.p1Games > set.p2Games).length;
  return {
    ok: true,
    winnerId: p1Wins > sets.length / 2 ? player1Id : player2Id,
    set: { ...sets[0] },
    sets: sets.map((set) => ({ ...set })),
  };
}
