import { describe, expect, it } from "vitest";
import { derivePlayerProfile, type ProfileMatch } from "./profile";

const sets = [{ p1Games: 6, p2Games: 4, tiebreakP1: null, tiebreakP2: null }];

const matches: ProfileMatch[] = [
  {
    id: "m1",
    player1Id: "alice",
    player2Id: "bob",
    winnerId: "alice",
    type: "ranked",
    status: "approved",
    playedAt: "2026-07-01T10:00:00Z",
    sets,
  },
  {
    id: "m2",
    player1Id: "bob",
    player2Id: "alice",
    winnerId: "bob",
    type: "exhibition",
    status: "approved",
    playedAt: "2026-07-02T10:00:00Z",
    sets,
  },
  {
    id: "m3",
    player1Id: "alice",
    player2Id: "carol",
    winnerId: "alice",
    type: "ranked",
    status: "approved",
    playedAt: "2026-07-03T10:00:00Z",
    sets,
  },
  {
    id: "m4",
    player1Id: "alice",
    player2Id: "dave",
    winnerId: "alice",
    type: "ranked",
    status: "pending_approval",
    playedAt: "2026-07-04T10:00:00Z",
    sets,
  },
];

describe("derivePlayerProfile", () => {
  it("keeps ranked and exhibition records separate", () => {
    const profile = derivePlayerProfile("alice", matches);

    expect(profile.ranked).toEqual({ won: 2, lost: 0, played: 2 });
    expect(profile.exhibition).toEqual({ won: 0, lost: 1, played: 1 });
  });

  it("derives chronological points, grouped head-to-head, and recent approved matches", () => {
    const profile = derivePlayerProfile("alice", matches);

    expect(profile.pointsTrend).toEqual([
      { playedAt: "2026-07-01T10:00:00Z", points: 1016 },
      { playedAt: "2026-07-03T10:00:00Z", points: 1031 },
    ]);
    expect(profile.headToHead).toEqual([
      { opponentId: "bob", won: 1, lost: 1, played: 2 },
      { opponentId: "carol", won: 1, lost: 0, played: 1 },
    ]);
    expect(profile.matchLog.map((match) => match.id)).toEqual(["m3", "m2", "m1"]);
  });

  it("does not mutate input facts or their set scores", () => {
    const snapshot = structuredClone(matches);
    derivePlayerProfile("alice", matches);
    expect(matches).toEqual(snapshot);
  });
});
