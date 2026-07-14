import { describe, expect, it } from "vitest";
import { applyBoundaryDecider, boundaryDecider, deriveTournamentStandings, generateRoundRobin, planFinalStage, planTopFourSemifinals, resolveDecider, resolveRoundRobinPlacements } from "./logic";

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

describe("configurable championship paths", () => {
  const standings = [
    { playerId:"a",seed:1,played:5,won:5,lost:0,gamesWon:15,gamesLost:2,gameDifference:13 },
    { playerId:"b",seed:2,played:5,won:3,lost:2,gamesWon:12,gamesLost:8,gameDifference:4 },
    { playerId:"c",seed:3,played:5,won:3,lost:2,gamesWon:10,gamesLost:9,gameDifference:1 },
    { playerId:"d",seed:4,played:5,won:2,lost:3,gamesWon:8,gamesLost:11,gameDifference:-3 },
    { playerId:"e",seed:5,played:5,won:2,lost:3,gamesWon:7,gamesLost:12,gameDifference:-5 },
    { playerId:"f",seed:6,played:5,won:0,lost:5,gamesWon:2,gamesLost:15,gameDifference:-13 },
  ];

  it("selects the two players immediately across each tied cutoff", () => {
    expect(boundaryDecider(standings,"top_two_final")).toEqual(["b","c"]);
    expect(boundaryDecider(standings,"top_four_finals")).toEqual(["d","e"]);
    expect(boundaryDecider(standings,"standings")).toBeNull();
  });

  it("uses an on-court winner to swap only the qualification boundary", () => {
    expect(applyBoundaryDecider(standings,"top_four_finals","e").map((row)=>row.playerId)).toEqual(["a","b","c","e","d","f"]);
  });

  it("seeds top-four semifinals first-v-fourth and second-v-third", () => {
    expect(planTopFourSemifinals(standings)).toEqual({semifinal1:["a","d"],semifinal2:["b","c"]});
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
    expect(resolveRoundRobinPlacements(standings, null).map((row) => row.playerId)).toEqual(["A", "B", "C", "D"]);
  });

  it("creates and resolves a two-player boundary decider", () => {
    const standings = [
      { playerId: "A", won: 3 }, { playerId: "B", won: 1 }, { playerId: "C", won: 1 }, { playerId: "D", won: 1 },
    ].map((row, index) => ({ ...row, seed: index + 1, played: 3, lost: 3 - row.won, gamesWon: 10 - index, gamesLost: index, gameDifference: 10 - index * 2 }));
    const plan = planFinalStage(standings);
    expect(plan).toEqual({ kind: "decider", decider: ["B", "C"], securedFinalistId: "A", placementPlayerId: "D" });
    if (plan.kind === "decider") {
      expect(resolveDecider(plan, "C")).toEqual({ kind: "finals", final: ["A", "C"], playoff: ["B", "D"] });
      expect(resolveRoundRobinPlacements(standings, "C").map((row) => row.playerId)).toEqual(["A", "C", "B", "D"]);
    }
  });

  it("requires the qualification decider before finalising a tied table", () => {
    const standings = [
      { playerId: "A", won: 3 }, { playerId: "B", won: 1 }, { playerId: "C", won: 1 }, { playerId: "D", won: 1 },
    ].map((row, index) => ({ ...row, seed: index + 1, played: 3, lost: 3 - row.won, gamesWon: 10 - index, gamesLost: index, gameDifference: 10 - index * 2 }));
    expect(() => resolveRoundRobinPlacements(standings, null)).toThrow("qualification decider");
  });
});
