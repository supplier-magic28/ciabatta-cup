import { redirect } from "next/navigation";
import { StreakTracker } from "@/components/profile/StreakTracker";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dateKeyInZone, deriveStreak } from "@/lib/profile/streak";

export default async function ProfileStreakPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const supabase = await createClient();
  const [{ data: matches }, { data: manualDays }] = await Promise.all([
    supabase.from("matches").select("player1_id, player2_id, status, played_at").or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`),
    supabase.from("play_days").select("played_on").eq("player_id", player.id),
  ]);
  const todayKey = dateKeyInZone(new Date());
  const manual = (manualDays ?? []).map((day) => day.played_on);
  const stats = deriveStreak(player.id, matches ?? [], manual, todayKey);
  return <section><div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Keep the rally going</p><h2 className="font-heading text-2xl font-bold text-ink">Tennis streak</h2></div><StreakTracker playedDays={[...stats.playedDays]} todayKey={todayKey} currentStreak={stats.currentStreak} bestStreak={stats.bestStreak} manuallyMarkedToday={manual.includes(todayKey)} /></section>;
}
