import { describe, expect, it } from "vitest";
import { computeActivityPoints } from "./activityPoints";

const match = (overrides: Partial<Parameters<typeof computeActivityPoints>[1][number]> = {}) => ({ id: "m1", player1_id: "a", player2_id: "b", winner_id: "a", type: "ranked" as const, status: "approved", played_at: "2026-07-01T02:00:00Z", tournament_id: null, ...overrides });

describe("activity points", () => {
  it("awards ranked participation and winner bonus while retaining a zero floor", () => {
    const result = computeActivityPoints(["a","b"], [match()], [], [], [], "2026-07-01");
    expect(result.points.get("a")).toBe(30); expect(result.points.get("b")).toBe(15);
  });
  it("awards exhibition, external, approved practice, and placements", () => {
    const result = computeActivityPoints(["a","b"], [match({ type:"exhibition" }), match({ id:"m2", type:"unranked_external", player2_id:null })], [{ player_id:"a", points:100, awarded_at:"2026-07-01" }], [{ id:"p", player_id:"a", practiced_on:"2026-07-01", status:"approved" }], [], "2026-07-01");
    expect(result.points.get("a")).toBe(125); expect(result.points.get("b")).toBe(10);
  });
  it("permanently stacks daily, seven-day, and thirty-day drought deductions", () => {
    const result = computeActivityPoints(["a"], [match({ player2_id:null, type:"unranked_external" })], [{ player_id:"a", points:100, awarded_at:"2026-07-01" }], [], [], "2026-07-31");
    expect(result.points.get("a")).toBe(10); // 110 earned - 30 daily - 40 weekly - 30 monthly
    expect(result.watches.get("a")).toMatchObject({ daysSinceLastTennis:30, decayedSoFar:100, playedToday:false });
  });
  it("manual tennis resets drought without adding points or refunding earlier decay", () => {
    const result = computeActivityPoints(["a"], [match({ player2_id:null, type:"unranked_external" })], [], [], [{ player_id:"a", played_on:"2026-07-09" }], "2026-07-10");
    expect(result.points.get("a")).toBe(0); // +10, then -18 before reset, then -1; floor
    expect(result.watches.get("a")?.daysSinceLastTennis).toBe(1);
  });
  it("does not accrue debt before a player's first activity", () => {
    expect(computeActivityPoints(["a"], [], [], [], [], "2026-07-31").points.get("a")).toBe(0);
  });
});
