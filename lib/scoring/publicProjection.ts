import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyInZone } from "@/lib/profile/streak";
import { buildRatingCache, normalizeTournamentMatchDates, normalizeTournamentPlacementDates, type ScoringMatchWithEvent, type TournamentPlacementWithEvent } from "./materialization";

/** Load only the facts needed for the public, role-independent points projection. */
const loadProjection = cache(async (playerIdsKey: string, asOfDate: string) => {
  const playerIds = playerIdsKey ? playerIdsKey.split(",") : [];
  const db = createAdminClient();
  const [matches, placements, practices, playDays] = await Promise.all([
    db.from("matches").select("id,player1_id,player2_id,winner_id,type,status,played_at,tournament_id,tournaments(starts_at)"),
    db.from("tournament_placements").select("tournament_id,player_id,placement,points,awarded_at,tournaments(starts_at)"),
    db.from("practice_sessions").select("id,player_id,practiced_on,status"),
    db.from("play_days").select("player_id,played_on"),
  ]);
  if (matches.error || placements.error || practices.error || playDays.error) {
    throw new Error("Couldn't load the public ladder projection.");
  }
  const matchRows = normalizeTournamentMatchDates((matches.data ?? []) as ScoringMatchWithEvent[]);
  const placementRows = normalizeTournamentPlacementDates((placements.data ?? []) as Array<TournamentPlacementWithEvent & {
    tournament_id: string;
    placement: number;
  }>);
  return {
    cache: buildRatingCache(playerIds, matchRows, placementRows, practices.data ?? [], playDays.data ?? [], asOfDate),
    matches: matchRows,
    placements: placementRows,
    asOfDate,
  };
});

export async function loadPublicLadderProjection(playerIds: string[], asOfDate = dateKeyInZone(new Date())) {
  return loadProjection([...new Set(playerIds)].sort().join(","), asOfDate);
}

/** Route contract for the public ladder. Kept explicit so integration tests exercise the loader the home screen owns. */
export async function loadLeaderboardProjection(playerIds: string[], asOfDate = dateKeyInZone(new Date())) {
  return loadPublicLadderProjection(playerIds, asOfDate);
}

/** Route contract for player profiles. Its projection must remain exact with the ladder for the same date. */
export async function loadPlayerProfileProjection(playerIds: string[], asOfDate = dateKeyInZone(new Date())) {
  return loadPublicLadderProjection(playerIds, asOfDate);
}
