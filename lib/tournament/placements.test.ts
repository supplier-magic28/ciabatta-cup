import { describe, expect, it } from "vitest";
import { deriveOfficialPlacements } from "./placements";

const fixtures = [
  { id: "g1", stage: "group", round_number: 1 },
  { id: "f", stage: "final", round_number: 4 },
  { id: "p", stage: "playoff", round_number: 4 },
];
const matches = [
  { id: "m1", fixture_id: "g1", player1_id: "a", player2_id: "b", winner_id: "a", status: "approved", played_at: "2026-07-11T01:00:00Z" },
  { id: "m2", fixture_id: "f", player1_id: "a", player2_id: "b", winner_id: "b", status: "approved", played_at: "2026-07-11T02:00:00Z" },
  { id: "m3", fixture_id: "p", player1_id: "c", player2_id: "d", winner_id: "c", status: "approved", played_at: "2026-07-11T02:00:00Z" },
];
const sets = [
  { match_id: "m1", p1_games: 3, p2_games: 1, tiebreak_p1: null, tiebreak_p2: null },
  { match_id: "m2", p1_games: 4, p2_games: 6, tiebreak_p1: null, tiebreak_p2: null },
  { match_id: "m3", p1_games: 6, p2_games: 2, tiebreak_p1: null, tiebreak_p2: null },
];

describe("deriveOfficialPlacements", () => {
  it("uses resolved standings for round-robin completion and includes every played match", () => {
    const result = deriveOfficialPlacements({ completionPath: "round_robin", standings: ["a", "b", "c", "d"].map((playerId) => ({ playerId })), fixtures, matches: matches.slice(0, 1), sets });
    expect(result.map(({ playerId, points }) => [playerId, points])).toEqual([["a", 100], ["b", 50], ["c", 20], ["d", 10]]);
    expect(result[0].matches).toEqual([{ opponentId: "b", score: "3-1", won: true }]);
  });

  it("uses final and playoff winners for final-stage placement", () => {
    const result = deriveOfficialPlacements({ completionPath: "final_stage", standings: [], fixtures, matches, sets });
    expect(result.map((row) => row.playerId)).toEqual(["b", "a", "c", "d"]);
    expect(result[1].matches).toHaveLength(2);
  });
});
