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
  status: "pending" | "processing" | "failed";
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
  "tournament_locked_in",
  "tournament_game_day",
  "tournament_result_1st",
  "tournament_result_2nd",
  "tournament_result_3rd",
  "tournament_result_4th",
  "tournament_result_5th",
  "tournament_result_6th",
  "tournament_result_7th",
  "tournament_result_8th",
  "tournament_invite",
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
  if (health.actionableDeliveries.some((delivery) => delivery.status !== "failed")) return "amber";
  return "green";
}
