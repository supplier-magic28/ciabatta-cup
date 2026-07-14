import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildRatingCache, normalizeTournamentPlacementDates, type ScoringMatchRow, type TournamentPlacementWithEvent } from "./materialization";
import { dateKeyInZone } from "@/lib/profile/streak";

/**
 * Recompute and atomically replace the derived rating cache from match facts.
 *
 * The service-role client is deliberate: ordinary users cannot write either
 * `rating_history` or `players.rating_points`. Callers must authorize before
 * reaching this function; the database RPC is executable by service_role only.
 */
export async function rebuildRatingCache(): Promise<void> {
  let staleError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await rebuildAtCurrentVersion();
      return;
    } catch (error) {
      if (!(error instanceof StaleScoringSnapshotError)) throw error;
      staleError = error;
    }
  }
  throw staleError ?? new Error("Couldn't rebuild the rating cache from a stable fact version.");
}

class StaleScoringSnapshotError extends Error {}

async function rebuildAtCurrentVersion(): Promise<void> {
  const supabase = createAdminClient();
  const before = await supabase.from("scoring_cache_state").select("fact_version").eq("singleton", true).single();
  if (before.error || before.data?.fact_version == null) throw new Error("Couldn't read the scoring fact version.");
  const [playersResult, matchesResult, placementsResult, practicesResult, playDaysResult] = await Promise.all([
    supabase.from("players").select("id"),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, type, status, played_at, tournament_id"),
    supabase.from("tournament_placements").select("player_id, points, awarded_at, tournaments(starts_at)"),
    supabase.from("practice_sessions").select("id, player_id, practiced_on, status"),
    supabase.from("play_days").select("player_id, played_on"),
  ]);

  if (playersResult.error || matchesResult.error || placementsResult.error || practicesResult.error || playDaysResult.error) {
    throw new Error("Couldn't load match facts to rebuild ratings.");
  }

  const after = await supabase.from("scoring_cache_state").select("fact_version").eq("singleton", true).single();
  if (after.error || after.data?.fact_version == null) throw new Error("Couldn't verify the scoring fact version.");
  if (before.data.fact_version !== after.data.fact_version) {
    throw new StaleScoringSnapshotError("Scoring facts changed while the snapshot was loading.");
  }

  const cache = buildRatingCache(
    (playersResult.data ?? []).map((player) => player.id),
    (matchesResult.data ?? []) as ScoringMatchRow[],
    normalizeTournamentPlacementDates((placementsResult.data ?? []) as TournamentPlacementWithEvent[]),
    practicesResult.data ?? [],
    playDaysResult.data ?? [],
    dateKeyInZone(new Date()),
  );

  const { error } = await supabase.rpc("replace_rating_cache_with_reigns_v2", {
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
    p_source_version: before.data.fact_version,
  });

  if (error) {
    console.error("Rating cache replacement RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.message.includes("stale scoring snapshot")) {
      throw new StaleScoringSnapshotError(error.message);
    }
    throw new Error(`Couldn't write the rebuilt rating cache: ${error.message}`);
  }
}
