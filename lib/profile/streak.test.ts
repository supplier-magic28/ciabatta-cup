import { describe, expect, it } from "vitest";
import { dateKeyInZone, deriveStreak, streakWindow } from "./streak";

const player = "p1";
const match = (played_at: string, status = "approved", tournament = false) => ({
  player1_id: player, player2_id: tournament ? "p2" : null, status, played_at,
});

describe("profile streak derivation", () => {
  it("unions and deduplicates match and manual days", () => {
    const result = deriveStreak(player, [match("2026-07-10T02:00:00Z")], ["2026-07-10", "2026-07-11"], "2026-07-12");
    expect([...result.playedDays]).toEqual(["2026-07-10", "2026-07-11"]);
    expect(result.currentStreak).toBe(2);
    expect(result.bestStreak).toBe(2);
  });

  it("uses yesterday grace and resets after a complete missed day", () => {
    expect(deriveStreak(player, [match("2026-07-11T02:00:00Z")], [], "2026-07-12").currentStreak).toBe(1);
    expect(deriveStreak(player, [match("2026-07-10T02:00:00Z")], [], "2026-07-12").currentStreak).toBe(0);
  });

  it("counts pending, queried, tournament, and external days but rejects rejected rows", () => {
    const result = deriveStreak(player, [
      match("2026-07-08T02:00:00Z", "pending_confirmation"),
      match("2026-07-09T02:00:00Z", "queried"),
      match("2026-07-10T02:00:00Z", "approved", true),
      match("2026-07-11T02:00:00Z", "rejected"),
    ], [], "2026-07-11");
    expect([...result.playedDays]).toEqual(["2026-07-08", "2026-07-09", "2026-07-10"]);
    expect(result.bestStreak).toBe(3);
  });

  it("uses Melbourne calendar boundaries and builds 7/30 windows", () => {
    expect(dateKeyInZone("2026-07-10T15:30:00Z")).toBe("2026-07-11");
    const window = streakWindow(new Set(["2026-07-12"]), "2026-07-12", 7);
    expect(window).toHaveLength(7);
    expect(window.at(-1)).toEqual({ date: "2026-07-12", played: true, today: true });
  });
});
