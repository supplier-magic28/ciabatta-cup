import { describe, expect, it } from "vitest";
import { indexEmbeddedScoreSets, indexEmbeddedSets } from "./embeddedSets";

describe("embedded match sets", () => {
  it("orders sets and maps them to the shared display shape", () => {
    const rows = [{
      id: "match-1",
      match_sets: [
        { set_number: 2, p1_games: 7, p2_games: 6, tiebreak_p1: 7, tiebreak_p2: 4 },
        { set_number: 1, p1_games: 6, p2_games: 3, tiebreak_p1: null, tiebreak_p2: null },
      ],
    }];
    expect(indexEmbeddedSets(rows).get("match-1")?.map((set) => set.set_number)).toEqual([1, 2]);
    expect(indexEmbeddedScoreSets(rows).get("match-1")).toEqual([
      { p1Games: 6, p2Games: 3, tiebreakP1: null, tiebreakP2: null },
      { p1Games: 7, p2Games: 6, tiebreakP1: 7, tiebreakP2: 4 },
    ]);
  });

  it("does not mutate embedded rows and handles missing sets", () => {
    const set = { set_number: 2, p1_games: 6, p2_games: 4, tiebreak_p1: null, tiebreak_p2: null };
    const rows = [{ id: "one", match_sets: [set] }, { id: "two", match_sets: null }];
    indexEmbeddedSets(rows);
    expect(rows[0].match_sets).toEqual([set]);
    expect(indexEmbeddedSets(rows).get("two")).toEqual([]);
  });
});
