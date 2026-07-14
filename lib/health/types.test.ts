import { describe, expect, it } from "vitest";
import { healthTone, isRetryableDeliveryKind, type BackendHealth } from "./types";

const healthy: BackendHealth = {
  generatedAt: "2026-07-18T00:00:00Z",
  cache: { factVersion: 2, builtVersion: 2, drift: 0, rebuiltAt: "2026-07-18T00:00:00Z" },
  integrityIssues: [],
  deliveryCounts: { sent: 3 },
  actionableDeliveries: [],
  infrastructure: { triggers: { guard: true }, notificationsRealtime: true },
};

describe("backend health status", () => {
  it("is green when every contract is healthy", () => expect(healthTone(healthy)).toBe("green"));
  it("is amber for stale pending delivery work", () => expect(healthTone({
    ...healthy,
    actionableDeliveries: [{ idempotencyKey:"key",kind:"practice_logged",playerId:"p",entityType:"practice",entityId:"e",status:"pending",attemptCount:1,lastError:null,updatedAt:"2026-07-17T00:00:00Z",stale:true }],
  })).toBe("amber"));
  it("is red for cache drift, integrity failures, infrastructure failures, or failed mail", () => {
    expect(healthTone({ ...healthy, cache: { ...healthy.cache, drift: 1 } })).toBe("red");
    expect(healthTone({ ...healthy, integrityIssues: [{ kind:"orphan",entityId:"x" }] })).toBe("red");
    expect(healthTone({ ...healthy, infrastructure: { ...healthy.infrastructure, notificationsRealtime:false } })).toBe("red");
    expect(healthTone({ ...healthy, actionableDeliveries: [{ idempotencyKey:"key",kind:"practice_logged",playerId:"p",entityType:"practice",entityId:"e",status:"failed",attemptCount:1,lastError:"provider",updatedAt:"2026-07-17T00:00:00Z",stale:false }] })).toBe("red");
  });
  it("allows retries only for reconstructable delivery kinds", () => {
    expect(isRetryableDeliveryKind("planned_confirmed")).toBe(true);
    expect(isRetryableDeliveryKind("obsolete_kind")).toBe(false);
  });
});
