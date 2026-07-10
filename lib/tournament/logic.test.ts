import { describe, expect, it } from "vitest";
import { deriveTournamentStandings, generateRoundRobin, planFinalStage, resolveDecider } from "./logic";

describe("generateRoundRobin", () => {
  it("matches the four-player qualifier draw exactly", () => {
    const rounds = generateRoundRobin(["Ben", "String", "Michaels", "Ringo"], 2);
    expect(rounds.map((round) => round.fixtures.map((f) => [f.player1Id, f.player2Id]))).toEqual([
      [["Ben", "String"], ["Michaels", "Ringo"]],
      [["Ben", "Michaels"], ["Ringo", "String"]],
      [["Ben", "Ringo"], ["String", "Michaels"]],
    ]);
    expect(rounds.every((round) => round.fixtures.every((fixture) => fixture.slotNumber === 1))).toBe(true);
  });

  it("gives five players one rest each without duplicate pairings", () => {
    const players = ["A", "B", "C", "D", "E"];
    const rounds = generateRoundRobin(players, 2);
    expect(rounds).toHaveLength(5);
    expect(rounds.map((round) => round.restingPlayerId).sort()).toEqual([...players].sort());
    const pairs = rounds.flatMap((round) => round.fixtures.map((f) => [f.player1Id, f.player2Id].sort().join(":")));
    expect(new Set(pairs).size).toBe(10);
    expect(rounds.every((round) => round.fixtures.every((fixture) => fixture.courtNumber <= 2))).toBe(true);
  });

  it("does not mutate participant input", () => {
    const players = ["A", "B", "C", "D"] as const;
    generateRoundRobin(players, 2);
    expect(players).toEqual(["A", "B", "C", "D"]);
  });
});

const participants = ["A", "B", "C", "D"].map((playerId, index) => ({ playerId, seed: index + 1 }));

describe("tournament standings and progression", () => {
  it("orders wins, game difference, then head-to-head", () => {
    const standings = deriveTournamentStandings(participants, [
      { fixtureId: "1", player1Id: "A", player2Id: "B", winnerId: "A", player1Games: 3, player2Games: 0 },
      { fixtureId: "2", player1Id: "C", player2Id: "D", winnerId: "C", player1Games: 3, player2Games: 2 },
      { fixtureId: "3", player1Id: "A", player2Id: "C", winnerId: "A", player1Games: 3, player2Games: 2 },
      { fixtureId: "4", player1Id: "B", player2Id: "D", winnerId: "B", player1Games: 3, player2Games: 0 },
    ]);
    expect(standings.map((standing) => standing.playerId)).toEqual(["A", "B", "C", "D"]);
    expect(standings[0]).toMatchObject({ won: 2, gameDifference: 4 });
  });

  it("creates finals when the qualification boundary is clear", () => {
    const standings = [
      { playerId: "A", won: 3 }, { playerId: "B", won: 2 }, { playerId: "C", won: 1 }, { playerId: "D", won: 0 },
    ].map((row, index) => ({ ...row, seed: index + 1, played: 3, lost: 3 - row.won, gamesWon: 0, gamesLost: 0, gameDifference: 0 }));
    expect(planFinalStage(standings)).toEqual({ kind: "finals", final: ["A", "B"], playoff: ["C", "D"] });
  });

  it("creates and resolves a two-player boundary decider", () => {
    const standings = [
      { playerId: "A", won: 3 }, { playerId: "B", won: 1 }, { playerId: "C", won: 1 }, { playerId: "D", won: 1 },
    ].map((row, index) => ({ ...row, seed: index + 1, played: 3, lost: 3 - row.won, gamesWon: 10 - index, gamesLost: index, gameDifference: 10 - index * 2 }));
    const plan = planFinalStage(standings);
    expect(plan).toEqual({ kind: "decider", decider: ["B", "C"], securedFinalistId: "A", placementPlayerId: "D" });
    if (plan.kind === "decider") {
      expect(resolveDecider(plan, "C")).toEqual({ kind: "finals", final: ["A", "C"], playoff: ["B", "D"] });
    }
  });
});
