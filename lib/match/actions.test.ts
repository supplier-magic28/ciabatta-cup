import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  rebuildRatingCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/scoring/rebuild", () => ({ rebuildRatingCache: mocks.rebuildRatingCache }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { rebuildRatings } from "./actions";

describe("rebuildRatings", () => {
  beforeEach(() => {
    mocks.getSessionPlayer.mockReset();
    mocks.rebuildRatingCache.mockReset();
    mocks.revalidatePath.mockReset();
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
