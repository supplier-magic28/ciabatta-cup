import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  sendPlannedLifecycleEmail: vi.fn(),
  sendTournamentEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/planned/delivery", () => ({ sendPlannedLifecycleEmail: mocks.sendPlannedLifecycleEmail }));
vi.mock("@/lib/tournament/email", () => ({ sendTournamentEmail: mocks.sendTournamentEmail }));

import { retryLifecycleDelivery } from "./actions";

const failed = {
  idempotency_key: "delivery-key",
  kind: "planned_locked",
  player_id: "player-1",
  entity_type: "planned_match",
  entity_id: "plan-1",
  status: "failed",
  updated_at: "2026-07-18T00:00:00Z",
};

function adminFor(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return { single: async () => ({ data: rows[table] ?? null }) };
            },
            in: async () => ({ data: rows[table] ?? null }),
          };
        },
      };
    },
  };
}

describe("lifecycle email recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPlayer.mockResolvedValue({ role: "admin" });
    mocks.sendPlannedLifecycleEmail.mockResolvedValue(undefined);
    mocks.sendTournamentEmail.mockResolvedValue("provider-id");
  });

  it("rejects a non-organiser before reading the delivery ledger", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({ ok:false, error:"Only organisers can retry deliveries." });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("retries one planned recipient from canonical facts", async () => {
    const delivery = { ...failed, idempotency_key:"planned/plan-1/locked/player-1" };
    mocks.createAdminClient.mockReturnValue(adminFor({ lifecycle_email_deliveries:delivery }));
    await expect(retryLifecycleDelivery(delivery.idempotency_key)).resolves.toEqual({ ok:true });
    expect(mocks.sendPlannedLifecycleEmail).toHaveBeenCalledWith("plan-1", "locked", undefined, "player-1");
  });

  it("rejects a planned delivery whose key does not match canonical facts", async () => {
    mocks.createAdminClient.mockReturnValue(adminFor({ lifecycle_email_deliveries:failed }));
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({
      ok:false,
      error:"Planned delivery key does not match its canonical facts.",
    });
    expect(mocks.sendPlannedLifecycleEmail).not.toHaveBeenCalled();
  });

  it("reconstructs a practice email and preserves its idempotency key", async () => {
    const delivery = { ...failed, kind:"practice_approved", entity_type:"practice", entity_id:"practice-1" };
    mocks.createAdminClient.mockReturnValue(adminFor({
      lifecycle_email_deliveries:delivery,
      practice_sessions:{ id:"practice-1",player_id:"player-1",activity:"serve_practice",minutes:45,practiced_on:"2026-07-18" },
      players:{ id:"player-1",email:"player@test.invalid",first_name:"Player" },
    }));
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({ ok:true });
    expect(mocks.sendTournamentEmail).toHaveBeenCalledWith(
      "player@test.invalid",
      expect.objectContaining({ subject:expect.stringContaining("approved") }),
      "delivery-key",
      expect.objectContaining({ entityId:"practice-1", playerId:"player-1" }),
    );
  });

  it("reconstructs a ranked match email and preserves its idempotency key", async () => {
    const delivery = { ...failed, kind:"ranked_match_logged",entity_type:"match",entity_id:"match-1" };
    mocks.createAdminClient.mockReturnValue(adminFor({
      lifecycle_email_deliveries:delivery,
      matches:{ id:"match-1",type:"ranked",player1_id:"player-1",player2_id:"player-2",winner_id:"player-1",submitted_by:"player-1",external_won:false,played_at:"2026-07-18T00:00:00Z",planned_match_id:null,match_sets:[{set_number:1,p1_games:6,p2_games:4,tiebreak_p1:null,tiebreak_p2:null}] },
      players:[
        { id:"player-1",email:"one@test.invalid",first_name:"One",last_name:"Player",nickname:null,use_nickname:false },
        { id:"player-2",email:"two@test.invalid",first_name:"Two",last_name:"Player",nickname:null,use_nickname:false },
      ],
    }));
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({ ok:true });
    expect(mocks.sendTournamentEmail).toHaveBeenCalledWith(
      "one@test.invalid",
      expect.objectContaining({ subject:"Ciabatta Cup: ranked result logged" }),
      "delivery-key",
      expect.objectContaining({ entityId:"match-1", playerId:"player-1" }),
    );
  });

  it("leaves unknown delivery kinds visible for manual recovery", async () => {
    mocks.createAdminClient.mockReturnValue(adminFor({ lifecycle_email_deliveries:{ ...failed,kind:"legacy_unknown" } }));
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({ ok:false, error:"This delivery needs manual recovery." });
    expect(mocks.sendTournamentEmail).not.toHaveBeenCalled();
  });

  it("does not retry a delivery that is already sent", async () => {
    mocks.createAdminClient.mockReturnValue(adminFor({ lifecycle_email_deliveries:{ ...failed,status:"sent" } }));
    await expect(retryLifecycleDelivery("delivery-key")).resolves.toEqual({ ok:false, error:"This delivery is not ready to retry." });
  });
});
