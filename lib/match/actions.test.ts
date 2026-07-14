import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  rebuildRatingCache: vi.fn(),
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
  queueUntaggedNudges: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/scoring/rebuild", () => ({ rebuildRatingCache: mocks.rebuildRatingCache }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/notifications/untagged", () => ({ queueUntaggedNudges: mocks.queueUntaggedNudges }));

import { adminLogMatch, rebuildRatings } from "./actions";

describe("rebuildRatings", () => {
  beforeEach(() => {
    mocks.getSessionPlayer.mockReset();
    mocks.rebuildRatingCache.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.createClient.mockReset();
    mocks.queueUntaggedNudges.mockReset();
  });

  it("rejects direct match logging for a non-admin", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(adminLogMatch({ player1Id:"a", player2Id:"b", type:"ranked", format:"one_set", formatNote:"", playedDate:"2026-07-01", location:"", sets:[{selfGames:6,opponentGames:4,selfTiebreak:null,opponentTiebreak:null}] })).resolves.toEqual({ ok:false, error:"Only admins can directly log matches." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("logs an admin match, rebuilds points, and returns a cache warning without losing the match", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "admin" });
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data:"court-id", error:null })
      .mockResolvedValueOnce({ data:"match-id", error:null });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.rebuildRatingCache.mockRejectedValue(new Error("cache unavailable"));
    const result = await adminLogMatch({ player1Id:"a", player2Id:"b", type:"exhibition", format:"one_set", formatNote:"", playedDate:"2026-07-01", location:"Centre Court", sets:[{selfGames:6,opponentGames:4,selfTiebreak:null,opponentTiebreak:null}] });
    expect(result).toEqual({ ok:true, matchId:"match-id", warning:"Match approved, but the derived points cache needs an admin rebuild." });
    expect(rpc).toHaveBeenLastCalledWith("admin_log_match_v1", expect.objectContaining({ p_player1_id:"a", p_player2_id:"b", p_winner_player_id:"a" }));
    expect(mocks.queueUntaggedNudges).toHaveBeenCalledWith("match-id");
  });

  it("rejects a non-admin before reaching the service-role rebuild", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });

    await expect(rebuildRatings()).resolves.toEqual({ ok: false, error: "Only admins can rebuild ratings." });
    expect(mocks.rebuildRatingCache).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the rebuild fails", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "admin" });
    mocks.rebuildRatingCache.mockRejectedValue(new Error("missing secret"));

    await expect(rebuildRatings()).resolves.toEqual({
      ok: false,
      error: "Couldn't rebuild ratings. Check the server configuration.",
    });
  });

  it("rebuilds and invalidates the board, profiles, and approval queue for an admin", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "admin" });
    mocks.rebuildRatingCache.mockResolvedValue(undefined);

    await expect(rebuildRatings()).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/approvals");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/players/[playerId]", "page");
  });
});
