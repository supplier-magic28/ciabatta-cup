"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { renderPracticeEmail } from "./email";
import { validatePractice } from "./validation";

export type PracticeActionState = { ok: true; id: string; warning?: string } | { ok: false; error: string };

export async function submitPractice(_previous: PracticeActionState | undefined, formData: FormData): Promise<PracticeActionState> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in." };
  const checked = validatePractice({ activity: String(formData.get("activity") ?? ""), minutes: Number(formData.get("minutes")), practicedOn: String(formData.get("practicedOn") ?? ""), note: String(formData.get("note") ?? "") });
  if (!checked.ok) return checked;
  const supabase = await createClient();
  const { data, error } = await supabase.from("practice_sessions").insert({ player_id: player.id, activity: checked.value.activity, minutes: checked.value.minutes, practiced_on: checked.value.practicedOn, note: checked.value.note }).select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't log that practice. Please try again." };
  let warning: string | undefined;
  try { await sendTournamentEmail(player.email, renderPracticeEmail({ kind: "logged", firstName: player.firstName ?? "Player", activity: checked.value.activity, minutes: checked.value.minutes, practiceDate: checked.value.practicedOn }), `practice/logged/${data.id}/${player.id}`, {kind:"practice_logged",playerId:player.id,entityType:"practice",entityId:data.id}); }
  catch { warning = "Practice logged, but the confirmation email could not be sent."; }
  revalidatePath("/practice/new"); revalidatePath("/admin/approvals");
  return { ok: true, id: data.id, warning };
}

export async function reviewPractice(id: string, decision: "approved" | "rejected"): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const reviewer = await getSessionPlayer();
  if (!reviewer || reviewer.role !== "admin") return { ok: false, error: "Only admins can review practice." };
  const supabase = await createClient();
  const { data: practice } = await supabase.from("practice_sessions").select("id, player_id, activity, minutes, practiced_on, status, players!practice_sessions_player_id_fkey(email, first_name)").eq("id", id).single();
  if (!practice || (practice.status !== "pending" && practice.status !== decision)) return { ok: false, error: "This practice is no longer awaiting review." };
  const { error } = await supabase.rpc("review_practice_v1", { p_practice_id:id, p_decision:decision });
  if (error) return { ok: false, error: "Couldn't review that practice." };
  let warning: string | undefined;
  if (decision === "approved") try { await rebuildRatingCache(); } catch (cacheError) {
    console.error("Committed practice review needs a derived-cache rebuild", { entityId:id, operation:"review_practice", recovery:"Run the organiser rating rebuild.", error:cacheError });
    warning = "Practice was approved, but the points cache needs an organiser rebuild.";
  }
  const owner = Array.isArray(practice.players) ? practice.players[0] : practice.players;
  try { if (owner?.email) await sendTournamentEmail(owner.email, renderPracticeEmail({ kind: decision, firstName: owner.first_name ?? "Player", activity: practice.activity, minutes: practice.minutes, practiceDate: practice.practiced_on }), `practice/${decision}/${id}/${practice.player_id}`, {kind:`practice_${decision}`,playerId:practice.player_id,entityType:"practice",entityId:id}); } catch { /* committed review remains successful */ }
  for (const path of ["/admin/approvals", "/", "/profile/streak", "/players/[playerId]"]) revalidatePath(path);
  return { ok: true, warning };
}
