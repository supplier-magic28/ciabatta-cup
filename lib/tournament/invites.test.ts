import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer:vi.fn(),
  createClient:vi.fn(),
  deliverCupInviteEmails:vi.fn(),
  revalidatePath:vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionPlayer:mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/server", () => ({ createClient:mocks.createClient }));
vi.mock("./invite-delivery", () => ({ deliverCupInviteEmails:mocks.deliverCupInviteEmails }));
vi.mock("next/cache", () => ({ revalidatePath:mocks.revalidatePath }));

import { acceptCupInvite, sendCupInvites } from "./invites";

function inviteForm() {
  const form = new FormData();
  form.set("tournamentId", "cup-1");
  form.append("playerIds", "player-1");
  form.append("playerIds", "player-2");
  form.set("deadline", "2026-07-20T10:00");
  form.set("timezoneOffset", "-600");
  return form;
}

describe("cup invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPlayer.mockResolvedValue({ id:"admin",role:"admin",status:"active" });
    mocks.deliverCupInviteEmails.mockResolvedValue({ attempted:1,delivered:1,failed:0,deliveryKeys:[] });
  });

  it("uses the browser offset, v2 generation contract, and never resends an accepted RSVP", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data:null,error:null })
      .mockResolvedValueOnce({ data:[
        { player_id:"player-1",generation:3,status:"sent" },
        { player_id:"player-2",generation:1,status:"accepted" },
      ],error:null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(sendCupInvites(undefined, inviteForm())).resolves.toEqual({
      ok:true,
      message:"Recorded 1 invitation; email delivery is complete.",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "send_tournament_invites_v2", {
      p_tournament_id:"cup-1",
      p_player_ids:["player-1","player-2"],
      p_hold_until:"2026-07-20T00:00:00.000Z",
    });
    expect(mocks.deliverCupInviteEmails).toHaveBeenCalledWith("cup-1", [
      { playerId:"player-1",generation:3 },
    ]);
  });

  it("keeps the committed invitation successful when delivery needs recovery", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data:null,error:null })
      .mockResolvedValueOnce({ data:[{ player_id:"player-1",generation:2,status:"sent" }],error:null });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.deliverCupInviteEmails.mockResolvedValue({ attempted:1,delivered:0,failed:1,deliveryKeys:["key"] });
    const form = inviteForm();
    form.delete("playerIds");
    form.append("playerIds", "player-1");
    await expect(sendCupInvites(undefined, form)).resolves.toEqual({
      ok:true,
      message:"Invitations recorded; 1 email needs recovery in System health.",
      deliveryWarning:{
        code:"email_delivery_pending",
        message:"Invitations committed, but email delivery needs recovery.",
        recoveryPath:"/admin/health",
        deliveryKeys:["key"],
      },
    });
  });

  it("preserves a locked-field response instead of calling every error expired", async () => {
    mocks.createClient.mockResolvedValue({
      rpc:vi.fn().mockResolvedValue({ data:null,error:{ message:"the final field is already locked" } }),
    });
    await expect(acceptCupInvite("cup-1")).resolves.toEqual({
      ok:false,
      error:"The final field is already locked.",
    });
  });
});
