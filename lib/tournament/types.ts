export type TournamentRuleset =
  | "short_first_to_3"
  | "standard_set_tiebreak_6_all"
  | "pro_set_8"
  | "best_of_3_standard";

export type TournamentFrameShape = "wide" | "square" | "three_two";
export type TournamentChampionshipPath = "standings" | "top_two_final" | "top_four_finals";

export interface TournamentCropState {
  frameShape: TournamentFrameShape;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface RoundRobinFixture {
  roundNumber: number;
  slotNumber: number;
  courtNumber: number;
  player1Id: string;
  player2Id: string;
}

export interface RoundRobinRound {
  roundNumber: number;
  restingPlayerId: string | null;
  fixtures: RoundRobinFixture[];
}

export interface TournamentResult {
  fixtureId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  player1Games: number;
  player2Games: number;
}

export interface TournamentStanding {
  playerId: string;
  seed: number;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
}

export type FinalStagePlan =
  | {
      kind: "finals";
      final: readonly [string, string];
      playoff: readonly [string, string];
    }
  | {
      kind: "decider";
      decider: readonly [string, string];
      securedFinalistId: string;
      placementPlayerId: string;
    };

export interface TournamentSetInput {
  p1Games: number;
  p2Games: number;
  tiebreakP1: number | null;
  tiebreakP2: number | null;
}

export type TournamentScoreValidation =
  | { ok: true; winnerId: string; set: TournamentSetInput; sets: TournamentSetInput[] }
  | { ok: false; error: string };
