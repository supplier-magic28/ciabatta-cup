"use server";
import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rebuildScoringAfterCommit } from "@/lib/workflow/post-commit";
import { validateSubmission, validateExternalSubmission } from "@/lib/match/submission";
import type { MatchSubmission, ExternalMatchSubmission } from "@/lib/match/types";
import { sendPlannedLifecycleEmail } from "./delivery";
import { otherPlannedParticipant } from "./workflow";

type Result = { ok: true; id?: string; warning?: string } | { ok: false; error: string };
const refresh = () => ["/", "/matches", "/profile", "/notifications", "/admin/approvals"].forEach((path) => revalidatePath(path));

export async function planMatch(input: { operationKey?: string; opponentPlayerId?: string; opponentExternalId?: string; scheduledAt: string; location: string; courtId?: string }): Promise<Result> {
  const player = await getSessionPlayer(); if (!player) return { ok:false, error:"Sign in to plan a match." };
  if ((!input.opponentPlayerId) === (!input.opponentExternalId)) return { ok:false, error:"Choose one opponent." };
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) return { ok:false, error:"Choose a valid time." };
  if (input.location.trim().length > 160) return { ok:false, error:"Location must be 160 characters or fewer." };
  const external = Boolean(input.opponentExternalId);
  const db = await createClient();
  let courtId: string | null = null;
  if (input.location.trim()) {
    const { data: resolved, error: courtError } = await db.rpc("resolve_court", { p_name: input.location.trim() });
    if (courtError || !resolved) return { ok:false, error:"Couldn't save that court." };
    courtId = resolved as string;
  }
  const { data, error } = await db.rpc("create_planned_match_v1", { p_operation_key:input.operationKey??crypto.randomUUID(), p_opponent_player_id:input.opponentPlayerId??null, p_opponent_external_id:input.opponentExternalId??null, p_scheduled_at:input.scheduledAt, p_location:input.location.trim(), p_court_id:courtId });
  if (error || typeof data!=="string") return { ok:false, error:error?.message??"Couldn't plan that match." };
  if (external) await sendLifecycleEmail(data, "locked");
  refresh(); return { ok:true, id:data };
}

export async function decidePlannedMatch(id:string, decision:"accept"|"decline"|"cancel"):Promise<Result> {
  const player=await getSessionPlayer(); if(!player) return {ok:false,error:"Sign in first."}; const db=await createClient();
  const {error}=await db.rpc("respond_planned_match_v1",{p_planned_match_id:id,p_decision:decision}); if(error)return {ok:false,error:error.message??"Couldn't update the plan."};
  if(decision==="accept") await sendLifecycleEmail(id,"locked");
  refresh();return {ok:true};
}

export async function submitPlannedResult(id:string, input:MatchSubmission|ExternalMatchSubmission, external=false):Promise<Result> {
  const player=await getSessionPlayer(); if(!player)return {ok:false,error:"Sign in first."}; const db=await createClient(); const {data:plan}=await db.from("planned_matches").select("*").eq("id",id).single(); if(!plan||plan.status!=="locked_in")return {ok:false,error:"This match is not ready for a result."}; if(player.id!==plan.created_by&&player.id!==plan.opponent_player_id)return {ok:false,error:"Only participants can report this result."};
  if(Date.now()<new Date(plan.scheduled_at).getTime())return {ok:false,error:"You can enter the score after the scheduled match time."};
  const otherId=otherPlannedParticipant(plan,player.id);
  if(!external&&!otherId)return {ok:false,error:"The other participant could not be resolved."};
  const checked=external?validateExternalSubmission(input as ExternalMatchSubmission,player.id):validateSubmission({...input as MatchSubmission,opponentId:otherId!},player.id); if(!checked.ok)return checked;
  let courtId: string | null = null;
  if (checked.value.location) { const {data:resolved,error:courtError}=await db.rpc("resolve_court",{p_name:checked.value.location}); if(courtError||!resolved)return {ok:false,error:"Couldn't save that court."}; courtId=resolved as string; }
  if (external) {
    const result = checked.value as import("@/lib/match/types").ValidatedExternalSubmission;
    const externalInput=input as ExternalMatchSubmission; const {data:matchId,error}=await db.rpc("record_external_planned_result_v3",{p_planned_match_id:id,p_opponent_name:externalInput.opponentName,p_save_opponent:externalInput.saveOpponent,p_format:result.format,p_format_note:result.formatNote,p_external_won:result.externalWon,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface,p_sets:result.sets.map(s=>({set_number:s.setNumber,p1_games:s.selfGames,p2_games:s.opponentGames,tiebreak_p1:s.selfTiebreak,tiebreak_p2:s.opponentTiebreak}))}); if(error||!matchId)return {ok:false,error:error?.message??"Couldn't save result."}; const warning=await rebuildScoringAfterCommit(matchId as string,"record_external_planned_result"); await sendLifecycleEmail(id,"confirmed",matchId as string); refresh();return {ok:true,id:matchId as string,warning};
  }
  const result=checked.value as import("@/lib/match/types").ValidatedSubmission;
  const {error}=await db.rpc("submit_planned_result_v2",{p_planned_match_id:id,p_match_type:result.type,p_format:result.format,p_format_note:result.formatNote,p_winner_player_id:result.winnerId,p_score:result.sets,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface}); if(error)return {ok:false,error:error.message??"Couldn't submit result."}; refresh();return {ok:true};
}

export async function approvePlannedResult(id:string):Promise<Result>{const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const db=await createClient();const {data,error}=await db.rpc("approve_planned_result_v2",{p_planned_match_id:id});if(error)return {ok:false,error:error.message??"This result cannot be approved."};const row=Array.isArray(data)?data[0]:data;let warning:string|undefined;if(row?.match_status==="approved"&&row.match_id){warning=await rebuildScoringAfterCommit(row.match_id,"approve_planned_result");await sendLifecycleEmail(id,"confirmed",row.match_id);}refresh();return {ok:true,id:row?.match_id,warning};}

export async function requestPlannedResultCorrection(id:string):Promise<Result>{const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const db=await createClient();const {error}=await db.rpc("request_planned_result_correction_v2",{p_planned_match_id:id});if(error)return {ok:false,error:error.message??"Couldn't request a correction."};refresh();return {ok:true};}

export async function correctPlannedResult(id:string,input:MatchSubmission):Promise<Result>{const player=await getSessionPlayer();if(!player||player.role!=="admin")return {ok:false,error:"Only organisers may correct results."};const db=await createClient();const [{data:plan},{data:prior}]=await Promise.all([db.from("planned_matches").select("created_by,opponent_player_id").eq("id",id).single(),db.from("planned_match_results").select("submitted_by").eq("planned_match_id",id).order("created_at",{ascending:false}).limit(1).single()]);if(!plan||!plan.opponent_player_id||!prior)return {ok:false,error:"Result proposal not found."};const other=prior.submitted_by===plan.created_by?plan.opponent_player_id:plan.created_by;const checked=validateSubmission({...input,opponentId:other},prior.submitted_by);if(!checked.ok)return checked;let courtId:string|null=null;if(checked.value.location){const {data:resolved,error:courtError}=await db.rpc("resolve_court",{p_name:checked.value.location});if(courtError||!resolved)return {ok:false,error:"Couldn't save that court."};courtId=resolved as string;}const result=checked.value;const {error}=await db.rpc("correct_planned_result_v2",{p_planned_match_id:id,p_match_type:result.type,p_format:result.format,p_format_note:result.formatNote,p_winner_player_id:result.winnerId,p_score:result.sets,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface});if(error)return {ok:false,error:error.message??"Couldn't save the correction."};refresh();return {ok:true};}

export async function sendLifecycleEmail(
  plannedMatchId: string,
  kind: "locked" | "confirmed",
  matchId?: string,
) {
  try {
    await sendPlannedLifecycleEmail(plannedMatchId, kind, matchId);
  } catch {
    // Email remains non-blocking after the lifecycle transition has committed.
  }
}

export type MarkNotificationsResult = { ok: true; count: number } | { ok: false; error: string };

export async function markNotificationsRead(): Promise<MarkNotificationsResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "Sign in first." };
  const db = await createClient();
  const { data, error } = await db.rpc("mark_notifications_read_v1");
  if (error) return { ok: false, error: "Zeus couldn't update your notifications." };
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  return { ok: true, count: typeof data==="number"?data:0 };
}

export async function openNotification(notificationId: string): Promise<{ok:true;target:string}|{ok:false;error:string}> {
  const player = await getSessionPlayer();
  if (!player) return {ok:false,error:"Sign in first."};
  const db = await createClient();
  const { data,error } = await db.rpc("open_notification_v1",{p_notification_id:notificationId});
  if(error||typeof data!=="string")return {ok:false,error:"Zeus couldn't open that notification."};
  return {ok:true,target:data};
}
