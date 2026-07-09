import { describe, it, expect } from "vitest";
import { computeRankings } from "./computeRankings";
import type { Match } from "./types";

/**
 * These tests establish the *pattern* for testing the scoring function, which
 * is the project's test spine (ARCHITECTURE.md §4). The current formula is a
 * placeholder (win count); when the real formula lands, the behavioural
 * assertions change but the shape of these tests — build match facts, compute,
 * assert on standings — stays.
 */

function match(overrides: Partial<Match> & Pick<Match, "winnerId" | "loserId">): Match {
  return {
    id: `${overrides.winnerId}>${overrides.loserId}`,
    ranked: true,
    playedAt: "2026-07-09",
    ...overrides,
  };
}

describe("computeRankings", () => {
  it("returns an empty standings table for no matches", () => {
    expect(computeRankings([])).toEqual([]);
  });

  it("ranks the winner above the loser for a single match", () => {
    const standings = computeRankings([match({ winnerId: "alice", loserId: "bob" })]);

    expect(standings).toEqual([
      { playerId: "alice", rank: 1, played: 1, won: 1, lost: 0 },
      { playerId: "bob", rank: 2, played: 1, won: 0, lost: 1 },
    ]);
  });

  it("aggregates played/won/lost across multiple matches", () => {
    const standings = computeRankings([
      match({ winnerId: "alice", loserId: "bob" }),
      match({ winnerId: "alice", loserId: "carol" }),
      match({ winnerId: "bob", loserId: "carol" }),
    ]);

    const alice = standings.find((s) => s.playerId === "alice");
    const bob = standings.find((s) => s.playerId === "bob");
    const carol = standings.find((s) => s.playerId === "carol");

    expect(alice).toMatchObject({ rank: 1, played: 2, won: 2, lost: 0 });
    expect(bob).toMatchObject({ rank: 2, played: 2, won: 1, lost: 1 });
    expect(carol).toMatchObject({ rank: 3, played: 2, won: 0, lost: 2 });
  });

  it("breaks ties deterministically by player id", () => {
    // zoe and amy each have one win — amy sorts first by id, independent of input order.
    const forward = computeRankings([
      match({ winnerId: "zoe", loserId: "amy" }),
      match({ winnerId: "amy", loserId: "zoe" }),
    ]);
    const reversed = computeRankings([
      match({ winnerId: "amy", loserId: "zoe" }),
      match({ winnerId: "zoe", loserId: "amy" }),
    ]);

    expect(forward.map((s) => s.playerId)).toEqual(["amy", "zoe"]);
    expect(forward).toEqual(reversed);
  });

  it("is pure — it does not mutate its input", () => {
    const matches = [match({ winnerId: "alice", loserId: "bob" })];
    const snapshot = structuredClone(matches);

    computeRankings(matches);

    expect(matches).toEqual(snapshot);
  });
});
