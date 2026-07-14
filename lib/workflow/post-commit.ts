import "server-only";

import { rebuildRatingCache } from "@/lib/scoring/rebuild";

export async function rebuildScoringAfterCommit(
  entityId: string,
  operation: string,
): Promise<string | undefined> {
  try {
    await rebuildRatingCache();
    return undefined;
  } catch (error) {
    console.error("Committed lifecycle needs a derived-cache rebuild", {
      entityId,
      operation,
      recovery: "Run the organiser rating rebuild.",
      error,
    });
    return "The result was saved, but the points cache needs an organiser rebuild.";
  }
}
