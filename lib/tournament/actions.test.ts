import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createClient: vi.fn(),
  rebuildRatingCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/scoring/rebuild", () => ({ rebuildRatingCache: mocks.rebuildRatingCache }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { recordTournamentResult } from "./actions";

function resultForm() {
  const form = new FormData();
  form.set("fixtureId", "fixture-1");
  form.set("p1Games", "3");
  form.set("p2Games", "1");
  return form;
}

function adminClient(rpcError: unknown = null) {
  const fixtureQuery = {
    select: vi.fn(), eq: vi.fn(), single: vi.fn(),
  };
  fixtureQuery.select.mockReturnValue(fixtureQuery);
  fixtureQuery.eq.mockReturnValue(fixtureQuery);
  fixtureQuery.single.mockResolvedValue({
    data: {
      id: "fixture-1",
      tournament_id: "tournament-1",
      player1_id: "player-1",
      player2_id: "player-2",
      ruleset: "short_first_to_3",
    },
  });
  return {
    from: vi.fn().mockReturnValue(fixtureQuery),
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
  };
}

describe("recordTournamentResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rebuildRatingCache.mockResolvedValue(undefined);
  });

  it("rejects non-admins before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports a duplicate or transactional RPC failure without rebuilding Elo", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(adminClient(new Error("fixture already has a result")));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Couldn't record this result. It may already be complete.",
    });
    expect(mocks.rebuildRatingCache).not.toHaveBeenCalled();
  });

  it("surfaces cache rebuild failure after preserving the approved fact", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(adminClient());
    mocks.rebuildRatingCache.mockRejectedValue(new Error("missing service key"));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Result recorded, but Elo could not rebuild. Use the ratings recovery action.",
    });
  });

  it("records, rebuilds, and invalidates tournament surfaces", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = adminClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: true,
      message: "Result approved and Elo rebuilt.",
    });
    expect(client.rpc).toHaveBeenCalledWith("record_tournament_result", expect.objectContaining({
      p_fixture_id: "fixture-1",
      p_winner_id: "player-1",
    }));
    expect(mocks.rebuildRatingCache).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/tournaments/tournament-1");
  });
});
