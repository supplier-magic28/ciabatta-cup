import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildRatingCache, type ScoringMatchRow } from "./materialization";

/**
 * Recompute and atomically replace the derived rating cache from match facts.
 *
 * The service-role client is deliberate: ordinary users cannot write either
 * `rating_history` or `players.rating_points`. Callers must authorize before
 * reaching this function; the database RPC is executable by service_role only.
 */
export async function rebuildRatingCache(): Promise<void> {
  const supabase = createAdminClient();
  const [playersResult, matchesResult] = await Promise.all([
    supabase.from("players").select("id"),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, type, status, played_at"),
  ]);

  if (playersResult.error || matchesResult.error) {
    throw new Error("Couldn't load match facts to rebuild ratings.");
  }

  const cache = buildRatingCache(
    (playersResult.data ?? []).map((player) => player.id),
    (matchesResult.data ?? []) as ScoringMatchRow[],
  );

  const { error } = await supabase.rpc("replace_rating_cache_with_reigns", {
    p_history: cache.ratingHistory.map((entry) => ({
      match_id: entry.matchId,
      player_id: entry.playerId,
      points_before: entry.pointsBefore,
      points_after: entry.pointsAfter,
      rank_before: entry.rankBefore,
      rank_after: entry.rankAfter,
    })),
    p_ratings: cache.ratingPoints.map((entry) => ({
      player_id: entry.playerId,
      rating_points: entry.rating,
    })),
    p_reigns: cache.reigns.map((reign) => ({
      player_id: reign.playerId,
      started_at: reign.startedAt,
      ended_at: reign.endedAt,
    })),
  });

  if (error) throw new Error("Couldn't write the rebuilt rating cache.");
}
