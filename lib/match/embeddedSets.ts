import type { ScoreSet } from "./score";

export interface EmbeddedSetRow {
  set_number: number;
  p1_games: number;
  p2_games: number;
  tiebreak_p1: number | null;
  tiebreak_p2: number | null;
}

export interface MatchWithEmbeddedSets {
  id: string;
  match_sets: EmbeddedSetRow[] | null;
}

/** Index ordered embedded set facts without mutating the Supabase response. */
export function indexEmbeddedSets<T extends MatchWithEmbeddedSets>(matches: readonly T[]) {
  return new Map(
    matches.map((match) => [
      match.id,
      [...(match.match_sets ?? [])].sort((a, b) => a.set_number - b.set_number),
    ]),
  );
}

export function indexEmbeddedScoreSets<T extends MatchWithEmbeddedSets>(matches: readonly T[]): Map<string, ScoreSet[]> {
  return new Map(
    [...indexEmbeddedSets(matches)].map(([matchId, sets]) => [
      matchId,
      sets.map((set) => ({
        p1Games: set.p1_games,
        p2Games: set.p2_games,
        tiebreakP1: set.tiebreak_p1,
        tiebreakP2: set.tiebreak_p2,
      })),
    ]),
  );
}
