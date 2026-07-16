"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { committedEmailWarning, type CommittedEmailWarning } from "@/lib/email/delivery";
import { renderPracticeEmail } from "./email";
import { validatePractice } from "./validation";

export type PracticeActionState = { ok: true; id: string; warning?: string; deliveryWarning?: CommittedEmailWarning } | { ok: false; error: string };

export async function submitPractice(_previous: PracticeActionState | undefined, formData: FormData): Promise<PracticeActionState> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in." };
  if (player.status !== "active") return { ok: false, error: "You need an active account." };
  const checked = validatePractice({ activity: String(formData.get("activity") ?? ""), minutes: Number(formData.get("minutes")), practicedOn: String(formData.get("practicedOn") ?? ""), note: String(formData.get("note") ?? "") });
  if (!checked.ok) return checked;
  const operationKey = String(formData.get("operationKey") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationKey)) {
    return { ok:false, error:"Refresh this form before submitting practice." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_practice_v1", {
    p_operation_key:operationKey,
    p_activity:checked.value.activity,
    p_minutes:checked.value.minutes,
    p_practiced_on:checked.value.practicedOn,
    p_note:checked.value.note,
  });
  if (error || typeof data !== "string") return { ok: false, error: "Couldn't log that practice. Please try again." };
  const practiceId = data;
  let warning: string | undefined;
  let deliveryWarning: CommittedEmailWarning | undefined;
  try { await sendTournamentEmail(player.email, renderPracticeEmail({ kind: "logged", firstName: player.firstName ?? "Player", activity: checked.value.activity, minutes: checked.value.minutes, practiceDate: checked.value.practicedOn }), `practice/logged/${practiceId}/${player.id}`, {kind:"practice_logged",playerId:player.id,entityType:"practice",entityId:practiceId}); }
  catch {
    warning = "Practice logged, but the confirmation email could not be sent.";
    deliveryWarning = committedEmailWarning(warning, [`practice/logged/${practiceId}/${player.id}`]);
  }
  revalidatePath("/practice/new"); revalidatePath("/admin/approvals");
  return { ok: true, id: practiceId, warning, deliveryWarning };
}

export async function reviewPractice(id: string, decision: "approved" | "rejected"): Promise<{ ok: boolean; error?: string; warning?: string; deliveryWarning?: CommittedEmailWarning }> {
  const reviewer = await getSessionPlayer();
  if (!reviewer || reviewer.role !== "admin" || reviewer.status !== "active") return { ok: false, error: "Only active admins can review practice." };
  const supabase = await createClient();
  const { data: practice } = await supabase.from("practice_sessions").select("id, player_id, activity, minutes, practiced_on, status, players!practice_sessions_player_id_fkey(email, first_name)").eq("id", id).single();
  if (!practice || (practice.status !== "pending" && practice.status !== decision)) return { ok: false, error: "This practice is no longer awaiting review." };
  const { error } = await supabase.rpc("review_practice_v1", { p_practice_id:id, p_decision:decision });
  if (error) return { ok: false, error: "Couldn't review that practice." };
  let warning: string | undefined;
  let deliveryWarning: CommittedEmailWarning | undefined;
  if (decision === "approved") try { await rebuildRatingCache(); } catch (cacheError) {
    console.error("Committed practice review needs a derived-cache rebuild", { entityId:id, operation:"review_practice", recovery:"Run the organiser rating rebuild.", error:cacheError });
    warning = "Practice was approved, but the points cache needs an organiser rebuild.";
  }
  const owner = Array.isArray(practice.players) ? practice.players[0] : practice.players;
  const deliveryKey = `practice/${decision}/${id}/${practice.player_id}`;
  try {
    if (!owner?.email) throw new Error("Practice recipient is unavailable.");
    await sendTournamentEmail(owner.email, renderPracticeEmail({ kind: decision, firstName: owner.first_name ?? "Player", activity: practice.activity, minutes: practice.minutes, practiceDate: practice.practiced_on }), deliveryKey, {kind:`practice_${decision}`,playerId:practice.player_id,entityType:"practice",entityId:id});
  } catch {
    deliveryWarning = committedEmailWarning("Practice review committed, but its email needs recovery.", [deliveryKey]);
  }
  for (const path of ["/admin/approvals", "/", "/profile/streak", "/players/[playerId]"]) revalidatePath(path);
  return { ok: true, warning, deliveryWarning };
}
