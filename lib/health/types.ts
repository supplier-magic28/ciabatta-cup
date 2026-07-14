export type HealthTone = "green" | "amber" | "red";

export type IntegrityIssue = {
  kind: string;
  entityId: string;
};

export type ActionableDelivery = {
  idempotencyKey: string;
  kind: string;
  playerId: string | null;
  entityType: string;
  entityId: string | null;
  status: "pending" | "failed";
  attemptCount: number;
  lastError: string | null;
  updatedAt: string;
  stale: boolean;
};

export type BackendHealth = {
  generatedAt: string;
  cache: {
    factVersion: number;
    builtVersion: number;
    drift: number;
    rebuiltAt: string | null;
  };
  integrityIssues: IntegrityIssue[];
  deliveryCounts: Record<string, number>;
  actionableDeliveries: ActionableDelivery[];
  infrastructure: {
    triggers: Record<string, boolean>;
    notificationsRealtime: boolean;
  };
};

export const RETRYABLE_DELIVERY_KINDS = new Set([
  "ranked_match_logged",
  "external_match_logged",
  "practice_logged",
  "practice_approved",
  "practice_rejected",
  "planned_locked",
  "planned_confirmed",
]);

export function isRetryableDeliveryKind(kind: string) {
  return RETRYABLE_DELIVERY_KINDS.has(kind);
}

export function healthTone(health: BackendHealth): HealthTone {
  const infrastructureHealthy = health.infrastructure.notificationsRealtime
    && Object.values(health.infrastructure.triggers).every(Boolean);
  const hasFailedDelivery = health.actionableDeliveries.some((delivery) => delivery.status === "failed");
  if (health.cache.drift !== 0 || health.integrityIssues.length > 0 || !infrastructureHealthy || hasFailedDelivery) {
    return "red";
  }
  if (health.actionableDeliveries.some((delivery) => delivery.stale)) return "amber";
  return "green";
}
