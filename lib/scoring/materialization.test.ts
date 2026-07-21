import { describe, expect, it } from "vitest";
import { buildRatingCache, normalizeTournamentMatchDates, normalizeTournamentPlacementDates, toScoringMatches, type ScoringMatchRow } from "./materialization";

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
      { playerId: "alice", rating: 80, rank: 1, played: 0, won: 0, lost: 0 },
      { playerId: "bob", rating: 30, rank: 2, played: 0, won: 0, lost: 0 },
    ]);
    expect(cache.ratingHistory).toEqual([]);
    expect(cache.reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-11T00:00:00.000Z", endedAt: null },
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
      { playerId: "alice", startedAt: "2026-07-01T00:00:00.000Z", endedAt: null },
    ]);
    for (const ranking of cache.rankings) {
      const timeline = cache.activityTimelines.get(ranking.playerId) ?? [];
      expect(timeline.at(-1)?.points ?? 0).toBe(ranking.rating);
      expect(cache.activityLedgers.get(ranking.playerId)?.reduce((sum, entry) => sum + entry.delta, 0) ?? 0).toBeGreaterThanOrEqual(ranking.rating);
    }
  });

  it("adds tournament awards cumulatively to public activity points", () => {
    const cache = buildRatingCache(["alice", "bob"], rows, [
      { player_id: "alice", points: 100, awarded_at: "2026-07-11T04:00:00Z" },
      { player_id: "alice", points: 100, awarded_at: "2026-08-11T04:00:00Z" },
      { player_id: "bob", points: 50, awarded_at: "2026-08-11T04:00:00Z" },
    ]);
    expect(cache.ratingPoints).toEqual([
      { playerId: "alice", rating: 109 },
      { playerId: "bob", rating: 0 },
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

  it("replays legacy tournament placements on the tournament date", () => {
    expect(normalizeTournamentPlacementDates([{
      tournament_id:"cup-1",
      player_id:"alice",
      placement:1,
      points:100,
      awarded_at:"2026-07-17T01:00:00Z",
      tournaments:{ starts_at:"2026-07-11T00:00:00Z" },
    }])).toEqual([{
      tournament_id:"cup-1",
      player_id:"alice",
      placement:1,
      points:100,
      awarded_at:"2026-07-11T00:00:00Z",
    }]);
  });

  it("replays late-entered cup matches on the event date without rewriting ordinary dates", () => {
    const normalized = normalizeTournamentMatchDates([
      { ...rows[0], id:"cup-match", tournament_id:"cup-1", played_at:"2026-07-21T22:30:00Z", tournaments:{ starts_at:"2026-07-18T00:30:00Z" } },
      { ...rows[0], id:"ordinary-match", played_at:"2026-07-21T22:30:00Z", tournaments:null },
    ]);

    expect(normalized.map(({ id, played_at }) => ({ id, played_at }))).toEqual([
      { id:"cup-match", played_at:"2026-07-18T00:30:00Z" },
      { id:"ordinary-match", played_at:"2026-07-21T22:30:00Z" },
    ]);
    expect(normalized.every((row) => !("tournaments" in row))).toBe(true);
  });

  it("keeps Claymore placement awards intact before legitimate post-cup decay", () => {
    const matches = normalizeTournamentMatchDates([{
      ...rows[0], id:"claymore-match", tournament_id:"claymore", played_at:"2026-07-21T22:30:00Z",
      tournaments:{ starts_at:"2026-07-18T00:30:00Z" },
    }]);
    const placements = normalizeTournamentPlacementDates([
      { tournament_id:"claymore", player_id:"alice", points:20, awarded_at:"2026-07-21T22:30:00Z", tournaments:{ starts_at:"2026-07-18T00:30:00Z" } },
      { tournament_id:"claymore", player_id:"bob", points:10, awarded_at:"2026-07-21T22:30:00Z", tournaments:{ starts_at:"2026-07-18T00:30:00Z" } },
    ]);
    const cache = buildRatingCache(["alice", "bob"], matches, placements, [], [], "2026-07-22");

    expect(cache.activityLedgers.get("alice")).toContainEqual({ date:"2026-07-18", kind:"placement", sourceId:"claymore", delta:20 });
    expect(cache.activityLedgers.get("bob")).toContainEqual({ date:"2026-07-18", kind:"placement", sourceId:"claymore", delta:10 });
    expect(cache.ratingPoints).toEqual([
      { playerId:"alice", rating:16 },
      { playerId:"bob", rating:6 },
    ]);
    expect(cache.eloRatings.get("alice")).toBe(0);
    expect(cache.eloRatings.get("bob")).toBe(0);
  });

  it("keeps the activity-points incumbent ranked first when current totals tie", () => {
    const cache = buildRatingCache(["alice", "bob"], [
      { ...rows[0], id:"b-first", player1_id:"bob", player2_id:"alice", winner_id:"bob", played_at:"2026-07-01T10:00:00Z" },
      { ...rows[0], id:"a-catches", played_at:"2026-07-02T10:00:00Z" },
    ], [], [], [], "2026-07-02");

    expect(cache.rankings.map(({ playerId, rating }) => ({ playerId, rating }))).toEqual([
      { playerId:"bob", rating:45 },
      { playerId:"alice", rating:45 },
    ]);
    expect(cache.reigns).toEqual([
      { playerId:"bob", startedAt:"2026-07-01T00:00:00.000Z", endedAt:null },
    ]);
  });
});
