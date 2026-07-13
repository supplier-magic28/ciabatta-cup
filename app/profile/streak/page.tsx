import { redirect } from "next/navigation";
import { StreakTracker } from "@/components/profile/StreakTracker";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dateKeyInZone, deriveStreak } from "@/lib/profile/streak";
import { computeActivityPoints } from "@/lib/scoring";

export default async function ProfileStreakPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const supabase = await createClient();
  const [{ data: matches }, { data: manualDays }, { data: practices }, { data: placements }] = await Promise.all([
    supabase.from("matches").select("id, player1_id, player2_id, winner_id, type, status, played_at, tournament_id").or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`),
    supabase.from("play_days").select("played_on").eq("player_id", player.id),
    supabase.from("practice_sessions").select("id, player_id, practiced_on, status").eq("player_id", player.id),
    supabase.from("tournament_placements").select("player_id, points, awarded_at").eq("player_id", player.id),
  ]);
  const todayKey = dateKeyInZone(new Date());
  const manual = (manualDays ?? []).map((day) => day.played_on);
  const approvedPracticeDays = (practices ?? []).filter((practice) => practice.status === "approved").map((practice) => practice.practiced_on);
  const stats = deriveStreak(player.id, matches ?? [], [...manual, ...approvedPracticeDays], todayKey);
  const activity = computeActivityPoints([player.id], matches ?? [], placements ?? [], practices ?? [], manual.map((played_on) => ({ player_id: player.id, played_on })), todayKey);
  return <section><div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Keep the rally going</p><h2 className="font-heading text-2xl font-bold text-ink">Tennis streak</h2></div><StreakTracker playedDays={[...stats.playedDays]} todayKey={todayKey} currentStreak={stats.currentStreak} bestStreak={stats.bestStreak} manuallyMarkedToday={manual.includes(todayKey)} decayWatch={activity.watches.get(player.id)!} /></section>;
}
