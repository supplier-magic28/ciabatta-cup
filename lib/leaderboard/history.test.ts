import { describe, expect, it } from "vitest";
import { deriveLeaderboardHistory, type LeaderboardMatchRow } from "./history";

const players = ["alice", "bob", "carol"];
const tournaments = [
  { id: "ranked-cup", counts_as: "ranked", trophy_key:"claymore", trophy_name:"The Claymore", starts_at:"2026-07-18T00:00:00Z", timezone:"Australia/Melbourne" },
  { id: "friendly-cup", counts_as: "exhibition" },
];
const fixtures = [
  { id: "short", ruleset: "short_first_to_3" },
  { id: "final", ruleset: "standard_set_tiebreak_6_all" },
];

function match(overrides: Partial<LeaderboardMatchRow> = {}): LeaderboardMatchRow {
  return {
    player1_id: "alice",
    player2_id: "bob",
    winner_id: "alice",
    type: "ranked",
    status: "approved",
    tournament_id: null,
    fixture_id: null,
    match_sets: [{ p1_games: 6, p2_games: 4 }, { p1_games: 3, p2_games: 6 }, { p1_games: 6, p2_games: 2 }],
    ...overrides,
  };
}

describe("leaderboard history", () => {
  it("counts only ranked tournament wins as trophies", () => {
    const history = deriveLeaderboardHistory(players, [], [
      { player_id: "alice", tournament_id: "ranked-cup", placement: 1 },
      { player_id: "alice", tournament_id: "friendly-cup", placement: 1 },
      { player_id: "bob", tournament_id: "ranked-cup", placement: 2 },
    ], tournaments, fixtures);
    expect(history.get("alice")?.trophies).toBe(1);
    expect(history.get("alice")?.trophyAwards).toEqual([{tournamentId:"ranked-cup",key:"claymore",name:"The Claymore",startsAt:"2026-07-18T00:00:00Z",timezone:"Australia/Melbourne",named:true}]);
    expect(history.get("bob")?.trophies).toBe(0);
  });

  it("separates ordinary matches, full sets, and ranked tournament matches", () => {
    const history = deriveLeaderboardHistory(players, [
      match(),
      match({ tournament_id: "ranked-cup", fixture_id: "short", match_sets: [{ p1_games: 3, p2_games: 1 }] }),
      match({ tournament_id: "ranked-cup", fixture_id: "final", winner_id: "bob", match_sets: [{ p1_games: 4, p2_games: 6 }] }),
    ], [], tournaments, fixtures);
    expect(history.get("alice")).toMatchObject({
      rankedMatches: { won: 1, lost: 0 },
      rankedSets: { won: 2, lost: 2 },
      tournamentMatches: { won: 1, lost: 1 },
    });
    expect(history.get("bob")).toMatchObject({
      rankedMatches: { won: 0, lost: 1 },
      rankedSets: { won: 2, lost: 2 },
      tournamentMatches: { won: 1, lost: 1 },
    });
  });

  it("tracks external results only for the submitting player", () => {
    const history = deriveLeaderboardHistory(players, [
      match({ type: "unranked_external", player2_id: null, winner_id: "alice", match_sets: [] }),
      match({ type: "unranked_external", player2_id: null, winner_id: null, match_sets: [] }),
    ], [], tournaments, fixtures);
    expect(history.get("alice")?.externalMatches).toEqual({ won: 1, lost: 1 });
    expect(history.get("bob")?.externalMatches).toEqual({ won: 0, lost: 0 });
  });

  it("counts exhibitions while ignoring unapproved, friendly-ranked, and malformed results", () => {
    const ignored = [
      match({ status: "pending_approval" }),
      match({ type: "exhibition" }),
      match({ tournament_id: "friendly-cup", fixture_id: "final" }),
      match({ winner_id: "carol" }),
    ];
    const history = deriveLeaderboardHistory(players, ignored, [], tournaments, fixtures);
    expect(history.get("alice")).toEqual({
        trophies: 0,
        trophyAwards: [],
        rankedMatches: { won: 0, lost: 0 },
        rankedSets: { won: 0, lost: 0 },
        tournamentMatches: { won: 0, lost: 0 },
        nonRankedMatches: { won: 1, lost: 0 },
        externalMatches: { won: 0, lost: 0 },
    });
    expect(history.get("bob")?.nonRankedMatches).toEqual({ won: 0, lost: 1 });
    expect(history.get("carol")?.nonRankedMatches).toEqual({ won: 0, lost: 0 });
  });
});
