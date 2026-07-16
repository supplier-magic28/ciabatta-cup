import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient:vi.fn(),
  sendTournamentEmail:vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient:mocks.createAdminClient }));
vi.mock("./email", async (loadOriginal) => ({
  ...(await loadOriginal<typeof import("./email")>()),
  sendTournamentEmail:mocks.sendTournamentEmail,
}));

import { deliverTournamentResultEmails } from "./delivery";

const tournament = {
  id:"tournament-1",
  name:"Eight Player Cup",
  starts_at:"2026-07-18T01:00:00Z",
  timezone:"Australia/Melbourne",
  location_name:"Northcote",
  draw_locked_at:"2026-07-17T01:00:00Z",
};

function resultClient(playerCount = 8) {
  const placements = Array.from({ length:playerCount }, (_, index) => ({
    player_id:`player-${index + 1}`,
    placement:index + 1,
    points:[100,50,20,10,0,0,0,0][index],
  }));
  const players = placements.map((placement) => ({
    id:placement.player_id,
    email:`${placement.player_id}@test.invalid`,
    first_name:`Player ${placement.placement}`,
    last_name:"Cup",
    nickname:null,
    use_nickname:false,
    status:"active",
  }));
  return {
    from(table:string) {
      if (table === "tournaments") return { select:() => ({ eq:() => ({ single:async () => ({ data:tournament }) }) }) };
      if (table === "tournament_placements") return { select:() => ({ eq:() => ({ order:async () => ({ data:placements }) }) }) };
      if (table === "matches") return { select:() => ({ eq:() => ({ eq:() => ({ order:async () => ({ data:[] }) }) }) }) };
      if (table === "players") return { select:() => ({ in:async () => ({ data:players }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("tournament outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://cup.example";
    mocks.sendTournamentEmail.mockResolvedValue("provider-id");
  });

  it("delivers an official result to every persisted placement one through eight", async () => {
    mocks.createAdminClient.mockReturnValue(resultClient());
    await expect(deliverTournamentResultEmails("tournament-1")).resolves.toEqual(expect.objectContaining({
      attempted:8,
      delivered:8,
      failed:0,
    }));
    expect(mocks.sendTournamentEmail).toHaveBeenCalledTimes(8);
    expect(mocks.sendTournamentEmail).toHaveBeenLastCalledWith(
      "player-8@test.invalid",
      expect.objectContaining({ subject:expect.stringContaining("8th") }),
      "tournament/tournament-1/result_8th/player-8",
      {
        kind:"tournament_result_8th",
        playerId:"player-8",
        entityType:"tournament",
        entityId:"tournament-1",
      },
    );
  });

  it("requires a complete persisted placement recipient set", async () => {
    const client = resultClient(1);
    mocks.createAdminClient.mockReturnValue(client);
    await expect(deliverTournamentResultEmails("tournament-1")).rejects.toThrow("incomplete");
    expect(mocks.sendTournamentEmail).not.toHaveBeenCalled();
  });
});
