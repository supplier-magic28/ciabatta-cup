import { describe, expect, it } from "vitest";
import { H2H_MIN_GAMES, deriveH2HSummaries, deriveTournamentHistory, type NormalizedHistoryMatch } from "./history";

function result(index: number, overrides: Partial<NormalizedHistoryMatch> = {}): NormalizedHistoryMatch {
  return { id: `m${index}`, opponentKey: "player:p2", opponentName: "Ben", external: false, savedExternal: false, won: index % 2 === 0, playedAt: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`, type: "ranked", tournamentId: null, sets: [{ selfGames: 6, opponentGames: 4 }], pointsDelta: 10, ...overrides };
}

describe("profile H2H history", () => {
  it("offers zero-match opponents behind the same gate", () => {
    expect(deriveH2HSummaries([], [{ opponentKey: "player:p2", opponentName: "Ben", external: false }])[0]).toMatchObject({ played: 0, unlocked: false, remaining: 5, lastResult: null });
  });
  it("gates below five and unlocks at the shared threshold", () => {
    const four = deriveH2HSummaries(Array.from({ length: 4 }, (_, index) => result(index)))[0];
    expect(four).toMatchObject({ played: 4, unlocked: false, remaining: 1 });
    const five = deriveH2HSummaries(Array.from({ length: H2H_MIN_GAMES }, (_, index) => result(index)))[0];
    expect(five).toMatchObject({ played: 5, unlocked: true, remaining: 0, setsWon: 5, gamesWon: 30, gamesLost: 20 });
  });

  it("includes saved external opponents and excludes unsaved names from chips", () => {
    const summaries = deriveH2HSummaries([
      result(0, { opponentKey: "external:x", opponentName: "Dave", external: true, savedExternal: true }),
      result(1, { opponentKey: null, opponentName: "Transient", external: true, savedExternal: false }),
    ]);
    expect(summaries.map((summary) => summary.opponentName)).toEqual(["Dave"]);
  });
});

describe("tournament history", () => {
  it("derives player record and champion state", () => {
    const history = deriveTournamentHistory("p1", [{ id: "t1", name: "Cup", startsAt: "2026-07-01", locationName: "Northcote", coverImageUrl: null, participantCount: 4, structure: "Round robin", placement: 1, points: 100, matches: [{ player1Id: "p1", player2Id: "p2", winnerId: "p1" }, { player1Id: "p3", player2Id: "p1", winnerId: "p3" }] }]);
    expect(history[0]).toMatchObject({ won: 1, lost: 1, champion: true });
  });
});
