import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function queueUntaggedNudges(matchId: string) {
  const admin = createAdminClient();
  const { data: match } = await admin.from("matches").select("id, status, player1_id, player2_id, court_id, surface").eq("id", matchId).single();
  if (!match || match.status !== "approved" || (match.court_id && match.surface)) return;
  const playerIds = [match.player1_id, match.player2_id].filter((id): id is string => Boolean(id));
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  for (const playerId of playerIds) {
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("kind", "untagged_matches_nudge").gte("created_at", since);
    if (count) continue;
    await admin.from("notifications").insert({
      player_id: playerId,
      kind: "untagged_matches_nudge",
      body: "Some of your match records are missing a court or surface. Complete the record when you have a minute.",
      target_path: "/matches/untagged",
      dedupe_key: `untagged:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}

