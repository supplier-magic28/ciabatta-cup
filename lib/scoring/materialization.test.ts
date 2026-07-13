import { describe, expect, it } from "vitest";
import { buildRatingCache, toScoringMatches, type ScoringMatchRow } from "./materialization";

const rows: ScoringMatchRow[] = [
  {
    id: "m1",
    player1_id: "alice",
    player2_id: "bob",
    winner_id: "alice",
    type: "ranked",
    status: "approved",
    played_at: "2026-07-01T10:00:00Z",
    tournament_id: null,
  },
];

describe("rating cache materialization", () => {
  it("maps database rows losslessly into the scoring input", () => {
    expect(toScoringMatches(rows)).toEqual([
      {
        id: "m1",
        player1Id: "alice",
        player2Id: "bob",
        winnerId: "alice",
        type: "ranked",
        status: "approved",
        playedAt: "2026-07-01T10:00:00Z",
        tournamentId: null,
      },
    ]);
  });

  it("excludes cup matches from Elo and adds cumulative placement awards", () => {
    const tournamentRows = [{ ...rows[0], tournament_id: "cup-1" }];
    const cache = buildRatingCache(["alice", "bob"], tournamentRows, [
      { player_id: "alice", points: 100, awarded_at: "2026-07-11T04:00:00Z" },
      { player_id: "bob", points: 50, awarded_at: "2026-07-11T04:00:00Z" },
    ]);
    expect(cache.rankings).toEqual([
      { playerId: "alice", rating: 100, rank: 1, played: 0, won: 0, lost: 0 },
      { playerId: "bob", rating: 50, rank: 2, played: 0, won: 0, lost: 0 },
    ]);
    expect(cache.ratingHistory).toEqual([]);
    expect(cache.reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-11T04:00:00Z", endedAt: null },
    ]);
  });

  it("keeps players with no ranked results at zero and materializes history", () => {
    const cache = buildRatingCache(["alice", "bob", "carol"], rows);

    expect(cache.rankings).toEqual([
      { playerId: "alice", rating: 30, rank: 1, played: 1, won: 1, lost: 0 },
      { playerId: "bob", rating: 15, rank: 2, played: 1, won: 0, lost: 1 },
      { playerId: "carol", rating: 0, rank: 3, played: 0, won: 0, lost: 0 },
    ]);
    expect(cache.ratingPoints).toEqual([
      { playerId: "alice", rating: 30 },
      { playerId: "bob", rating: 15 },
      { playerId: "carol", rating: 0 },
    ]);
    expect(cache.ratingHistory).toHaveLength(2);
    expect(cache.reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-01T10:00:00Z", endedAt: null },
    ]);
  });

  it("adds tournament awards cumulatively to zero-based ordinary Elo", () => {
    const cache = buildRatingCache(["alice", "bob"], rows, [
      { player_id: "alice", points: 100, awarded_at: "2026-07-11T04:00:00Z" },
      { player_id: "alice", points: 100, awarded_at: "2026-08-11T04:00:00Z" },
      { player_id: "bob", points: 50, awarded_at: "2026-08-11T04:00:00Z" },
    ]);
    expect(cache.ratingPoints).toEqual([
      { playerId: "alice", rating: 230 },
      { playerId: "bob", rating: 65 },
    ]);
  });

  it("adds ten for every approved external match without changing Elo records", () => {
    const external: ScoringMatchRow[] = [
      { id: "x1", player1_id: "carol", player2_id: null, winner_id: null, type: "unranked_external", status: "approved", played_at: "2026-07-02T10:00:00Z", tournament_id: null },
      { id: "x2", player1_id: "carol", player2_id: null, winner_id: "carol", type: "unranked_external", status: "approved", played_at: "2026-07-03T10:00:00Z", tournament_id: null },
      { id: "x3", player1_id: "carol", player2_id: null, winner_id: "carol", type: "unranked_external", status: "pending_confirmation", played_at: "2026-07-04T10:00:00Z", tournament_id: null },
    ];
    const cache = buildRatingCache(["carol"], external);
    expect(cache.rankings).toEqual([{ playerId: "carol", rating: 20, rank: 1, played: 0, won: 0, lost: 0 }]);
    expect(cache.ratingHistory).toEqual([
      expect.objectContaining({ matchId: "x1", playerId: "carol", pointsBefore: 0, pointsAfter: 10, rankBefore: 1, rankAfter: 1 }),
      expect.objectContaining({ matchId: "x2", playerId: "carol", pointsBefore: 10, pointsAfter: 20, rankBefore: 1, rankAfter: 1 }),
    ]);
  });

  it("does not change its inputs", () => {
    const playerIds = ["alice", "bob", "carol"];
    const snapshot = structuredClone({ playerIds, rows });

    buildRatingCache(playerIds, rows);

    expect({ playerIds, rows }).toEqual(snapshot);
  });
});
