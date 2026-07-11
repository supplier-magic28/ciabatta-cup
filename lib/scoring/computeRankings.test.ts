import { describe, it, expect } from "vitest";
import { computeRankings } from "./computeRankings";
import { K_FACTOR, RATING_FLOOR, START_RATING, UNRANKED_POINTS } from "./constants";
import type { Match } from "./types";

/**
 * The scoring function is the project's test spine (ARCHITECTURE.md §4, ADR-0001):
 * pure, deterministic, and changed often, so it carries the highest-value tests.
 * Build immutable match facts → compute → assert on the ratings, ranks, and
 * rating-history the facts imply. Scoring decisions are recorded in ADR-0007.
 */

/** A ranked, approved match — the only kind that moves ratings. Winner is player1. */
function ranked(id: string, winner: string, loser: string, playedAt: string): Match {
  return { id, player1Id: winner, player2Id: loser, winnerId: winner, type: "ranked", status: "approved", playedAt };
}

/** An exhibition match (record only — never moves ratings). */
function exhibition(id: string, winner: string, loser: string, playedAt: string): Match {
  return { id, player1Id: winner, player2Id: loser, winnerId: winner, type: "exhibition", status: "approved", playedAt };
}

/** A ranked match that hasn't been approved yet — ignored by scoring. */
function pending(id: string, winner: string, loser: string, playedAt: string): Match {
  return { id, player1Id: winner, player2Id: loser, winnerId: winner, type: "ranked", status: "pending_approval", playedAt };
}

describe("computeRankings — Elo engine", () => {
  it("returns empty rankings and history for empty input", () => {
    expect(computeRankings([])).toEqual({ rankings: [], ratingHistory: [], reigns: [] });
  });

  it("everyone starts at zero with K=32 and losses clamp at zero", () => {
    const { rankings } = computeRankings([ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z")]);

    expect(START_RATING).toBe(0);
    expect(K_FACTOR).toBe(32);
    expect(rankings).toEqual([
      { playerId: "alice", rating: 16, rank: 1, played: 1, won: 1, lost: 0 },
      { playerId: "bob", rating: 0, rank: 2, played: 1, won: 0, lost: 1 },
    ]);
  });

  it("emits a rating_history entry per participant with points/rank before and after", () => {
    const { ratingHistory } = computeRankings([ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z")]);

    expect(ratingHistory).toEqual([
      { matchId: "m1", playerId: "alice", pointsBefore: 0, pointsAfter: 16, rankBefore: 1, rankAfter: 1, playedAt: "2026-07-01T10:00:00Z" },
      { matchId: "m1", playerId: "bob", pointsBefore: 0, pointsAfter: 0, rankBefore: 2, rankAfter: 2, playedAt: "2026-07-01T10:00:00Z" },
    ]);
  });

  it("weights by rating gap — an underdog win pays more, and can flip the rank", () => {
    // alice beats carol first (alice 16), then the zero-rated bob beats the
    // favourite alice: bob gains 17 (>16), alice loses 17, and bob overtakes.
    const { rankings, ratingHistory } = computeRankings([
      ranked("m1", "alice", "carol", "2026-07-01T10:00:00Z"),
      ranked("m2", "bob", "alice", "2026-07-02T10:00:00Z"),
    ]);

    expect(rankings).toEqual([
      { playerId: "bob", rating: 17, rank: 1, played: 1, won: 1, lost: 0 },
      { playerId: "alice", rating: 0, rank: 2, played: 2, won: 1, lost: 1 },
      { playerId: "carol", rating: 0, rank: 3, played: 1, won: 0, lost: 1 },
    ]);

    const bobRow = ratingHistory.find((h) => h.matchId === "m2" && h.playerId === "bob");
    const aliceRow = ratingHistory.find((h) => h.matchId === "m2" && h.playerId === "alice");
    expect(bobRow).toMatchObject({ pointsBefore: 0, pointsAfter: 17, rankBefore: 2, rankAfter: 1 });
    expect(aliceRow).toMatchObject({ pointsBefore: 16, pointsAfter: 0, rankBefore: 1, rankAfter: 2 });
  });

  it("keeps exhibition-only and pending-only players at zero points", () => {
    const { rankings, ratingHistory } = computeRankings([
      ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z"),
      exhibition("m2", "carol", "dave", "2026-07-02T10:00:00Z"),
      pending("m3", "eve", "frank", "2026-07-03T10:00:00Z"),
    ]);

    // Only the ranked+approved match moved anything or produced history.
    expect(ratingHistory).toHaveLength(2);
    expect(ratingHistory.every((h) => h.matchId === "m1")).toBe(true);

    const rated = Object.fromEntries(rankings.map((r) => [r.playerId, r]));
    expect(rated.alice).toMatchObject({ rating: 16, played: 1, won: 1, lost: 0 });
    expect(rated.bob).toMatchObject({ rating: 0, played: 1, won: 0, lost: 1 });
    // Exhibition- and pending-only participants remain unranked at zero points.
    for (const id of ["carol", "dave", "eve", "frank"]) {
      expect(rated[id]).toMatchObject({ rating: 0, played: 0, won: 0, lost: 0 });
    }
  });

  it("keeps tournament-linked ranked matches out of Elo", () => {
    const cupMatch = { ...ranked("cup", "alice", "bob", "2026-07-11T01:00:00Z"), tournamentId: "cup-1" };
    const { rankings, ratingHistory } = computeRankings([cupMatch]);
    expect(rankings).toEqual([
      { playerId: "alice", rating: 0, rank: 1, played: 0, won: 0, lost: 0 },
      { playerId: "bob", rating: 0, rank: 2, played: 0, won: 0, lost: 0 },
    ]);
    expect(ratingHistory).toEqual([]);
  });

  it("keeps a player with no approved ranked matches at zero", () => {
    const { rankings } = computeRankings([exhibition("m1", "dave", "erin", "2026-07-01T10:00:00Z")]);

    expect(UNRANKED_POINTS).toBe(0);
    expect(rankings).toEqual([
      { playerId: "dave", rating: 0, rank: 1, played: 0, won: 0, lost: 0 },
      { playerId: "erin", rating: 0, rank: 2, played: 0, won: 0, lost: 0 },
    ]);
  });

  it("is order-independent in input array order — matches are applied chronologically", () => {
    const matches = [
      ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z"),
      ranked("m2", "bob", "carol", "2026-07-02T10:00:00Z"),
      ranked("m3", "carol", "alice", "2026-07-03T10:00:00Z"),
    ];

    const forward = computeRankings(matches);
    const shuffled = computeRankings([matches[2], matches[0], matches[1]]);

    expect(shuffled).toEqual(forward);
  });

  it("is order-DEPENDENT in chronological order — the sequence changes the result", () => {
    // Same two results, different chronological order (via playedAt).
    const first = computeRankings([
      ranked("a", "A", "B", "2026-07-01T10:00:00Z"),
      ranked("b", "B", "C", "2026-07-02T10:00:00Z"),
    ]);
    const second = computeRankings([
      ranked("b", "B", "C", "2026-07-01T10:00:00Z"),
      ranked("a", "A", "B", "2026-07-02T10:00:00Z"),
    ]);

    expect(second).not.toEqual(first);
    expect(first.rankings.find((r) => r.playerId === "A")!.rating).toBe(16);
    expect(second.rankings.find((r) => r.playerId === "A")!.rating).toBe(17);
  });

  it("never lets a rating fall below the zero floor", () => {
    // With K=32 the floor is rarely reached organically, so this asserts the
    // invariant over a lopsided run: one victim loses to a fresh opponent each time.
    const matches: Match[] = [];
    for (let i = 0; i < 60; i++) {
      const day = String(i + 1).padStart(2, "0");
      matches.push(ranked(`m${i}`, `opp${i}`, "victim", `2026-07-${day}T10:00:00Z`));
    }
    const { rankings, ratingHistory } = computeRankings(matches);

    expect(RATING_FLOOR).toBe(0);
    for (const h of ratingHistory) expect(h.pointsAfter).toBeGreaterThanOrEqual(RATING_FLOOR);
    for (const r of rankings) expect(r.rating).toBeGreaterThanOrEqual(RATING_FLOOR);
    expect(rankings.find((r) => r.playerId === "victim")!.rating).toBe(0);
  });

  it("produces integer ratings and a deterministic, repeatable result", () => {
    const matches = [
      ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z"),
      ranked("m2", "carol", "alice", "2026-07-02T10:00:00Z"),
      ranked("m3", "bob", "carol", "2026-07-03T10:00:00Z"),
    ];

    const once = computeRankings(matches);
    const twice = computeRankings(matches);

    expect(once).toEqual(twice);
    for (const r of once.rankings) expect(Number.isInteger(r.rating)).toBe(true);
  });

  it("is pure — it does not mutate its input", () => {
    const matches = [ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z")];
    const snapshot = structuredClone(matches);

    computeRankings(matches);

    expect(matches).toEqual(snapshot);
  });

  it("starts no reign before a ranked result, then opens one for the first holder", () => {
    const ignored = exhibition("x1", "alice", "bob", "2026-07-01T10:00:00Z");
    expect(computeRankings([ignored]).reigns).toEqual([]);

    const result = computeRankings([ranked("m1", "alice", "bob", "2026-07-02T10:00:00Z")]);
    expect(result.reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-02T10:00:00Z", endedAt: null },
    ]);
  });

  it("closes a reign when a later ranked result changes the holder", () => {
    const result = computeRankings([
      ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z"),
      ranked("m2", "bob", "alice", "2026-07-02T10:00:00Z"),
    ]);

    expect(result.reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-01T10:00:00Z", endedAt: "2026-07-02T10:00:00Z" },
      { playerId: "bob", startedAt: "2026-07-02T10:00:00Z", endedAt: null },
    ]);
  });

  it("uses match id to order holder changes at the same timestamp", () => {
    const sameTime = "2026-07-01T10:00:00Z";
    const first = ranked("a", "alice", "bob", sameTime);
    const second = ranked("b", "bob", "alice", sameTime);

    expect(computeRankings([second, first]).reigns).toEqual([
      { playerId: "alice", startedAt: sameTime, endedAt: sameTime },
      { playerId: "bob", startedAt: sameTime, endedAt: null },
    ]);
  });

  it("recomputes reigns when a previously missing older result is approved", () => {
    const newer = ranked("m2", "bob", "alice", "2026-07-02T10:00:00Z");
    const older = ranked("m1", "alice", "bob", "2026-07-01T10:00:00Z");

    expect(computeRankings([newer]).reigns).toEqual([
      { playerId: "bob", startedAt: "2026-07-02T10:00:00Z", endedAt: null },
    ]);
    expect(computeRankings([newer, older]).reigns).toEqual([
      { playerId: "alice", startedAt: "2026-07-01T10:00:00Z", endedAt: "2026-07-02T10:00:00Z" },
      { playerId: "bob", startedAt: "2026-07-02T10:00:00Z", endedAt: null },
    ]);
  });
});
