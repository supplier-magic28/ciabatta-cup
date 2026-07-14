import { describe, expect, it } from "vitest";
import { validateTournamentScore } from "./score";

describe("validateTournamentScore", () => {
  it("accepts first-to-three scores and derives the winner", () => {
    expect(validateTournamentScore("short_first_to_3", "a", "b", {
      p1Games: 2, p2Games: 3, tiebreakP1: null, tiebreakP2: null,
    })).toMatchObject({ ok: true, winnerId: "b" });
  });

  it("rejects unfinished or overlong short sets", () => {
    expect(validateTournamentScore("short_first_to_3", "a", "b", {
      p1Games: 2, p2Games: 2, tiebreakP1: null, tiebreakP2: null,
    }).ok).toBe(false);
    expect(validateTournamentScore("short_first_to_3", "a", "b", {
      p1Games: 4, p2Games: 2, tiebreakP1: null, tiebreakP2: null,
    }).ok).toBe(false);
  });

  it("accepts full sets and requires a valid tie-break at 7-6", () => {
    expect(validateTournamentScore("standard_set_tiebreak_6_all", "a", "b", {
      p1Games: 6, p2Games: 4, tiebreakP1: null, tiebreakP2: null,
    }).ok).toBe(true);
    expect(validateTournamentScore("standard_set_tiebreak_6_all", "a", "b", {
      p1Games: 7, p2Games: 6, tiebreakP1: 7, tiebreakP2: 5,
    })).toMatchObject({ ok: true, winnerId: "a" });
    expect(validateTournamentScore("standard_set_tiebreak_6_all", "a", "b", {
      p1Games: 7, p2Games: 6, tiebreakP1: null, tiebreakP2: null,
    }).ok).toBe(false);
  });

  it("accepts a pro set with the standard 8-all tiebreak", () => {
    expect(validateTournamentScore("pro_set_8", "a", "b", {
      p1Games: 9, p2Games: 8, tiebreakP1: 10, tiebreakP2: 8,
    })).toMatchObject({ ok: true, winnerId: "a" });
  });

  it("requires two set wins and rejects a dead third set", () => {
    expect(validateTournamentScore("best_of_3_standard", "a", "b", [
      { p1Games:6,p2Games:4,tiebreakP1:null,tiebreakP2:null },
      { p1Games:3,p2Games:6,tiebreakP1:null,tiebreakP2:null },
      { p1Games:7,p2Games:5,tiebreakP1:null,tiebreakP2:null },
    ])).toMatchObject({ok:true,winnerId:"a"});
    expect(validateTournamentScore("best_of_3_standard", "a", "b", [
      { p1Games:6,p2Games:1,tiebreakP1:null,tiebreakP2:null },
      { p1Games:6,p2Games:2,tiebreakP1:null,tiebreakP2:null },
      { p1Games:6,p2Games:3,tiebreakP1:null,tiebreakP2:null },
    ]).ok).toBe(false);
  });
});
