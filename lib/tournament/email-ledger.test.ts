import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient:vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient:mocks.createAdminClient }));

import { sendTournamentEmail } from "./email";

describe("lifecycle delivery ledger", () => {
  const upsert = vi.fn();
  const update = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.TOURNAMENT_EMAIL_FROM = "Ciabatta Cup <cup@example.com>";
    update.mockReturnValue({ eq:vi.fn().mockResolvedValue({ error:null }) });
    mocks.createAdminClient.mockReturnValue({
      from:vi.fn().mockReturnValue({
        select:vi.fn().mockReturnValue({ eq:vi.fn().mockReturnValue({ maybeSingle:vi.fn().mockResolvedValue({ data:{status:"failed",attempt_count:2,provider_message_id:null} }) }) }),
        upsert,
        update,
      }),
    });
    upsert.mockResolvedValue({ error:null });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("increments attempts and sends with the same provider idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok:true,json:vi.fn().mockResolvedValue({id:"provider-1"}) });
    vi.stubGlobal("fetch", fetchMock);
    await sendTournamentEmail("player@test.invalid",{subject:"Subject",html:"<p>Hi</p>",text:"Hi"},"stable-key",{kind:"practice_logged",playerId:"player-1",entityType:"practice",entityId:"practice-1"});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key:"stable-key",attempt_count:3,status:"pending" }));
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("stable-key");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status:"sent",provider_message_id:"provider-1" }));
  });

  it("records a safe failed status when the provider rejects the retry", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:503}));
    await expect(sendTournamentEmail("player@test.invalid",{subject:"Subject",html:"<p>Hi</p>",text:"Hi"},"stable-key",{kind:"practice_logged",playerId:"player-1",entityType:"practice",entityId:"practice-1"})).rejects.toThrow("503");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status:"failed",last_error:"Email provider returned 503." }));
  });
});
