import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyInZone } from "@/lib/profile/streak";
import { buildRatingCache, normalizeTournamentPlacementDates, type ScoringMatchRow, type TournamentPlacementWithEvent } from "./materialization";

/** Load only the facts needed for the public, role-independent points projection. */
export async function loadPublicLadderProjection(playerIds: string[]) {
  const db = createAdminClient();
  const [matches, placements, practices, playDays] = await Promise.all([
    db.from("matches").select("id,player1_id,player2_id,winner_id,type,status,played_at,tournament_id"),
    db.from("tournament_placements").select("tournament_id,player_id,placement,points,awarded_at,tournaments(starts_at)"),
    db.from("practice_sessions").select("id,player_id,practiced_on,status"),
    db.from("play_days").select("player_id,played_on"),
  ]);
  if (matches.error || placements.error || practices.error || playDays.error) {
    throw new Error("Couldn't load the public ladder projection.");
  }
  const matchRows = (matches.data ?? []) as ScoringMatchRow[];
  const placementRows = normalizeTournamentPlacementDates((placements.data ?? []) as Array<TournamentPlacementWithEvent & {
    tournament_id: string;
    placement: number;
  }>);
  return {
    cache: buildRatingCache(playerIds, matchRows, placementRows, practices.data ?? [], playDays.data ?? [], dateKeyInZone(new Date())),
    matches: matchRows,
    placements: placementRows,
  };
}
