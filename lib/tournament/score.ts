import type { TournamentRuleset, TournamentScoreValidation, TournamentSetInput } from "./types";

function tiebreakIsValid(winner: number, loser: number): boolean {
  return winner >= 7 && winner - loser >= 2 && (winner === 7 || winner - loser === 2);
}

export function validateTournamentScore(
  ruleset: TournamentRuleset,
  player1Id: string,
  player2Id: string,
  input: TournamentSetInput,
): TournamentScoreValidation {
  const values = [input.p1Games, input.p2Games];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return { ok: false, error: "Enter whole, non-negative game scores." };
  }

  if (ruleset === "short_first_to_3") {
    if (input.tiebreakP1 != null || input.tiebreakP2 != null) {
      return { ok: false, error: "Short sets do not use a separate tie-break score." };
    }
    const valid =
      (input.p1Games === 3 && input.p2Games <= 2) ||
      (input.p2Games === 3 && input.p1Games <= 2);
    if (!valid) return { ok: false, error: "A short set ends when one player reaches 3 games." };
  } else {
    const p1Won =
      (input.p1Games === 6 && input.p2Games <= 4) ||
      (input.p1Games === 7 && [5, 6].includes(input.p2Games));
    const p2Won =
      (input.p2Games === 6 && input.p1Games <= 4) ||
      (input.p2Games === 7 && [5, 6].includes(input.p1Games));
    if (!p1Won && !p2Won) {
      return { ok: false, error: "Enter a completed full set: 6-0 to 6-4, 7-5, or 7-6." };
    }

    const reachedTiebreak = [input.p1Games, input.p2Games].sort((a, b) => a - b).join(":") === "6:7";
    if (reachedTiebreak) {
      if (input.tiebreakP1 == null || input.tiebreakP2 == null) {
        return { ok: false, error: "A 7-6 set needs both tie-break scores." };
      }
      const setWinnerTb = p1Won
        ? tiebreakIsValid(input.tiebreakP1, input.tiebreakP2)
        : tiebreakIsValid(input.tiebreakP2, input.tiebreakP1);
      if (!setWinnerTb) return { ok: false, error: "Enter a valid tie-break won by two points." };
    } else if (input.tiebreakP1 != null || input.tiebreakP2 != null) {
      return { ok: false, error: "Tie-break points belong only to a 7-6 set." };
    }
  }

  return {
    ok: true,
    winnerId: input.p1Games > input.p2Games ? player1Id : player2Id,
    set: { ...input },
  };
}
