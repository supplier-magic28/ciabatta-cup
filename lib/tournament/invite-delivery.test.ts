import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient:vi.fn(),
  sendTournamentEmail:vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient:mocks.createAdminClient }));
vi.mock("./email", () => ({ sendTournamentEmail:mocks.sendTournamentEmail }));

import { deliverCupInviteEmails } from "./invite-delivery";

function inviteClient(generation = 2) {
  const updateQuery = {
    eq() { return updateQuery; },
    then(resolve:(value:unknown)=>void) { resolve({ error:null }); },
  };
  return {
    from(table:string) {
      if (table === "tournaments") return { select:() => ({ eq:() => ({ single:async () => ({ data:{
        name:"Claymore Cup",starts_at:"2026-07-20T01:00:00Z",timezone:"Australia/Melbourne",location_name:"Northcote",
        cover_image_url:null,cover_frame_shape:"wide",cover_zoom:1,cover_offset_x:0,cover_offset_y:0,
      } }) }) }) };
      if (table === "players") return { select:() => ({ in:async () => ({ data:[{ id:"player-1",first_name:"Player",email:"player@test.invalid" }] }) }) };
      if (table === "tournament_invites") return {
        select:() => ({ eq:() => ({ in:async () => ({ data:[{ player_id:"player-1",generation,status:"sent",hold_until:"2026-07-19T01:00:00Z" }] }) }) }),
        update:() => updateQuery,
      };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("cup invitation outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://cup.example";
    mocks.sendTournamentEmail.mockResolvedValue("provider-id");
  });

  it("sends only the current invitation generation with canonical context", async () => {
    mocks.createAdminClient.mockReturnValue(inviteClient(2));
    await expect(deliverCupInviteEmails("cup-1", [{ playerId:"player-1",generation:2 }])).resolves.toEqual(expect.objectContaining({
      delivered:1,
      failed:0,
    }));
    expect(mocks.sendTournamentEmail).toHaveBeenCalledWith(
      "player@test.invalid",
      expect.objectContaining({ subject:"You've been invited to Claymore Cup" }),
      "tournament/cup-1/invite/player-1/g2",
      { kind:"tournament_invite",playerId:"player-1",entityType:"tournament",entityId:"cup-1" },
    );
  });

  it("never turns delivery retry into a resend of an obsolete generation", async () => {
    mocks.createAdminClient.mockReturnValue(inviteClient(3));
    await expect(deliverCupInviteEmails(
      "cup-1",
      [{ playerId:"player-1",generation:2 }],
      "tournament/cup-1/invite/player-1/g2",
    )).resolves.toEqual(expect.objectContaining({ delivered:0,failed:1 }));
    expect(mocks.sendTournamentEmail).not.toHaveBeenCalled();
  });
});
