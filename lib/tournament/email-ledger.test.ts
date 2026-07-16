import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient:vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient:mocks.createAdminClient }));

import { sendTournamentEmail } from "./email";

const context = {
  kind:"practice_logged" as const,
  playerId:"player-1",
  entityType:"practice",
  entityId:"practice-1",
};

describe("unified custom email outbox", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.TOURNAMENT_EMAIL_FROM = "Ciabatta Cup <cup@example.com>";
    rpc.mockImplementation((name:string) => Promise.resolve(name === "claim_custom_email_v1"
      ? { data:{ claimed:true,status:"processing" },error:null }
      : { data:null,error:null }));
    mocks.createAdminClient.mockReturnValue({
      from:vi.fn().mockReturnValue({
        select:vi.fn().mockReturnValue({
          eq:vi.fn().mockReturnValue({
            single:vi.fn().mockResolvedValue({ data:{ email:"player@test.invalid" },error:null }),
          }),
        }),
      }),
      rpc,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("persists context, atomically claims, and records the provider receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok:true,json:vi.fn().mockResolvedValue({id:"provider-1"}) });
    vi.stubGlobal("fetch", fetchMock);

    await sendTournamentEmail(
      "player@test.invalid",
      { subject:"Subject",html:"<p>Hi</p>",text:"Hi" },
      "stable-key",
      context,
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "enqueue_custom_email_v1", {
      p_idempotency_key:"stable-key",
      p_kind:"practice_logged",
      p_player_id:"player-1",
      p_entity_type:"practice",
      p_entity_id:"practice-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "claim_custom_email_v1", { p_idempotency_key:"stable-key" });
    expect(rpc).toHaveBeenNthCalledWith(3, "mark_custom_email_sent_v1", {
      p_idempotency_key:"stable-key",
      p_provider_message_id:"provider-1",
    });
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("stable-key");
  });

  it("records a safe failed status when the provider rejects the attempt", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:503}));
    await expect(sendTournamentEmail(
      "player@test.invalid",
      {subject:"Subject",html:"<p>Hi</p>",text:"Hi"},
      "stable-key",
      context,
    )).rejects.toThrow("503");
    expect(rpc).toHaveBeenCalledWith("mark_custom_email_failed_v1", {
      p_idempotency_key:"stable-key",
      p_last_error:"Email provider returned 503.",
    });
  });

  it("returns the durable receipt without contacting the provider after a sent claim", async () => {
    rpc.mockImplementation((name:string) => Promise.resolve(name === "claim_custom_email_v1"
      ? { data:{ claimed:false,status:"sent",providerMessageId:"provider-existing" },error:null }
      : { data:null,error:null }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    await expect(sendTournamentEmail(
      "player@test.invalid",
      {subject:"Subject",html:"<p>Hi</p>",text:"Hi"},
      "stable-key",
      context,
    )).resolves.toBe("provider-existing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a delivery intent that a newer lifecycle generation superseded", async () => {
    rpc.mockImplementation((name:string) => Promise.resolve(name === "claim_custom_email_v1"
      ? { data:{ claimed:false,status:"superseded" },error:null }
      : { data:null,error:null }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    await expect(sendTournamentEmail(
      "player@test.invalid",
      {subject:"Subject",html:"<p>Hi</p>",text:"Hi"},
      "stable-key",
      context,
    )).rejects.toThrow("superseded");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an address that differs from the canonical player recipient", async () => {
    await expect(sendTournamentEmail(
      "attacker@test.invalid",
      {subject:"Subject",html:"<p>Hi</p>",text:"Hi"},
      "stable-key",
      context,
    )).rejects.toThrow("does not match");
    expect(rpc).not.toHaveBeenCalled();
  });
});
