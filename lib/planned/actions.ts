"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { validateSubmission, validateExternalSubmission } from "@/lib/match/submission";
import type { MatchSubmission, ExternalMatchSubmission } from "@/lib/match/types";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { plannedEmail } from "./email";
import { queueUntaggedNudges } from "@/lib/notifications/untagged";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const refresh = () => ["/", "/matches", "/profile", "/notifications", "/admin/approvals"].forEach((path) => revalidatePath(path));
const note = async (playerId: string, kind: "match_proposed"|"match_declined"|"match_cancelled"|"match_locked_in"|"result_to_approve"|"result_confirmed", plannedMatchId: string, body: string) => createAdminClient().from("notifications").insert({ player_id: playerId, kind, planned_match_id: plannedMatchId, target_path: `/matches/${plannedMatchId}`, body });

export async function planMatch(input: { opponentPlayerId?: string; opponentExternalId?: string; scheduledAt: string; location: string; courtId?: string }): Promise<Result> {
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
  const admin = createAdminClient();
  const { data, error } = await admin.from("planned_matches").insert({ created_by:player.id, opponent_player_id:input.opponentPlayerId ?? null, opponent_external_id:input.opponentExternalId ?? null, scheduled_at:input.scheduledAt, location:input.location.trim(), court_id:courtId, status:external ? "locked_in":"proposed", accepted_at:external ? new Date().toISOString():null }).select("id").single();
  if (error || !data) return { ok:false, error:"Couldn't plan that match." };
  if (input.opponentPlayerId) await note(input.opponentPlayerId, "match_proposed", data.id, "I have a match proposal waiting for your answer.");
  if (external) await sendLifecycleEmail(data.id, "locked");
  refresh(); return { ok:true, id:data.id };
}

export async function decidePlannedMatch(id:string, decision:"accept"|"decline"|"cancel"):Promise<Result> {
  const player=await getSessionPlayer(); if(!player) return {ok:false,error:"Sign in first."}; const admin=createAdminClient();
  const {data:plan}=await admin.from("planned_matches").select("*").eq("id",id).single(); if(!plan) return {ok:false,error:"Match plan not found."};
  const invited=plan.opponent_player_id===player.id; const participant=invited||plan.created_by===player.id; if(!participant) return {ok:false,error:"Only match participants can do that."};
  if(decision==="accept" && (!invited || plan.status!=="proposed")) return {ok:false,error:"This proposal cannot be accepted."};
  const status=decision==="accept"?"locked_in":decision==="decline"?"declined":"cancelled";
  if(decision!=="accept" && plan.status!=="locked_in" && !(decision==="decline"&&plan.status==="proposed")) return {ok:false,error:"This plan cannot be changed."};
  const {error}=await admin.from("planned_matches").update({status,accepted_at:decision==="accept"?new Date().toISOString():plan.accepted_at,cancelled_by:decision==="cancel"?player.id:null}).eq("id",id); if(error)return {ok:false,error:"Couldn't update the plan."};
  const other=plan.created_by===player.id?plan.opponent_player_id:plan.created_by;
  if(other) await note(other, decision==="accept"?"match_locked_in":decision==="decline"?"match_declined":"match_cancelled", id, decision==="accept"?"I have locked your match in.":decision==="decline"?"I have been told the proposed match is declined.":"I have been told the match was cancelled.");
  if(decision==="accept") await sendLifecycleEmail(id,"locked");
  refresh();return {ok:true};
}

export async function submitPlannedResult(id:string, input:MatchSubmission|ExternalMatchSubmission, external=false):Promise<Result> {
  const player=await getSessionPlayer(); if(!player)return {ok:false,error:"Sign in first."}; const admin=createAdminClient(); const {data:plan}=await admin.from("planned_matches").select("*").eq("id",id).single(); if(!plan||plan.status!=="locked_in")return {ok:false,error:"This match is not ready for a result."}; if(player.id!==plan.created_by&&player.id!==plan.opponent_player_id)return {ok:false,error:"Only participants can report this result."};
  const checked=external?validateExternalSubmission(input as ExternalMatchSubmission,player.id):validateSubmission(input as MatchSubmission,player.id); if(!checked.ok)return checked;
  const db = await createClient(); let courtId: string | null = null;
  if (checked.value.location) { const {data:resolved,error:courtError}=await db.rpc("resolve_court",{p_name:checked.value.location}); if(courtError||!resolved)return {ok:false,error:"Couldn't save that court."}; courtId=resolved as string; }
  await admin.from("planned_match_results").update({status:"superseded"}).eq("planned_match_id",id).eq("status","pending");
  if (external) {
    const result = checked.value as import("@/lib/match/types").ValidatedExternalSubmission;
    const externalInput=input as ExternalMatchSubmission; const {data:matchId,error}=await admin.rpc("log_external_match",{p_opponent_name:externalInput.opponentName,p_save_opponent:externalInput.saveOpponent,p_format:result.format,p_format_note:result.formatNote,p_external_won:result.externalWon,p_played_at:result.playedAt,p_location:result.location,p_sets:result.sets.map(s=>({set_number:s.setNumber,p1_games:s.selfGames,p2_games:s.opponentGames,tiebreak_p1:s.selfTiebreak,tiebreak_p2:s.opponentTiebreak}))}); if(error||!matchId)return {ok:false,error:"Couldn't save result."}; await admin.from("matches").update({planned_match_id:id,court_id:courtId,surface:result.surface,location:result.location}).eq("id",matchId); await admin.from("planned_matches").update({status:"confirmed"}).eq("id",id); await rebuildRatingCache(); await queueUntaggedNudges(matchId as string); await sendLifecycleEmail(id,"confirmed",matchId); refresh();return {ok:true};
  }
  const result=checked.value as import("@/lib/match/types").ValidatedSubmission;
  const payload={match_type:result.type,format:result.format,format_note:result.formatNote,winner_player_id:result.winnerId,score:result.sets,played_at:result.playedAt,location:result.location,court_id:courtId,surface:result.surface};
  const {data:proposal,error}=await admin.from("planned_match_results").insert({...payload,planned_match_id:id,submitted_by:player.id,status:"pending"}).select("id").single(); if(error||!proposal)return {ok:false,error:"Couldn't submit result."}; await admin.from("planned_matches").update({status:"awaiting_result_approval"}).eq("id",id); const other=plan.created_by===player.id?plan.opponent_player_id:plan.created_by; if(other)await note(other,"result_to_approve",id,"I need you to review a match result."); refresh();return {ok:true};
}

export async function approvePlannedResult(id:string):Promise<Result>{ const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const admin=createAdminClient();const {data:plan}=await admin.from("planned_matches").select("*").eq("id",id).single();const {data:proposal}=await admin.from("planned_match_results").select("*").eq("planned_match_id",id).eq("status","pending").single();if(!plan||!proposal||plan.opponent_player_id===null||proposal.submitted_by===player.id||player.id!==plan.created_by&&player.id!==plan.opponent_player_id)return {ok:false,error:"This result cannot be approved."};const status=proposal.match_type==="ranked"?"pending_approval":"approved";const {data:match,error}=await admin.from("matches").insert({type:proposal.match_type,format:proposal.format,format_note:proposal.format_note,player1_id:plan.created_by,player2_id:plan.opponent_player_id,winner_id:proposal.winner_player_id,submitted_by:proposal.submitted_by,played_at:proposal.played_at,location:proposal.location,court_id:proposal.court_id,surface:proposal.surface,status,planned_match_id:id}).select("id").single();if(error||!match)return {ok:false,error:"Couldn't create the match fact."};const sets=(proposal.score as Array<{setNumber:number;selfGames:number;opponentGames:number;selfTiebreak:number|null;opponentTiebreak:number|null}>).map(s=>({match_id:match.id,set_number:s.setNumber,p1_games:s.selfGames,p2_games:s.opponentGames,tiebreak_p1:s.selfTiebreak,tiebreak_p2:s.opponentTiebreak}));await admin.from("match_sets").insert(sets);await admin.from("planned_match_results").update({status:"approved",reviewed_at:new Date().toISOString()}).eq("id",proposal.id);await admin.from("planned_matches").update({status:status==="approved"?"confirmed":"awaiting_admin_approval"}).eq("id",id);if(status==="approved"){await rebuildRatingCache();await queueUntaggedNudges(match.id);await sendLifecycleEmail(id,"confirmed",match.id);}refresh();return {ok:true}; }

export async function sendLifecycleEmail(plannedMatchId:string,kind:"locked"|"confirmed",matchId?:string){try{const admin=createAdminClient();const {data:plan}=await admin.from("planned_matches").select("*, external_opponents(display_name)").eq("id",plannedMatchId).single();if(!plan)return;const ids=[plan.created_by,plan.opponent_player_id].filter((id):id is string=>Boolean(id));const {data:people}=await admin.from("players").select("id,email,first_name").in("id",ids);let match:any=null;if(matchId){const {data}=await admin.from("matches").select("winner_id,type,played_at,match_sets(p1_games,p2_games)").eq("id",matchId).single();match=data;}for(const person of people??[]){const other=(people??[]).find(p=>p.id!==person.id);const externalName=plan.external_opponents?.[0]?.display_name;const winner=(people??[]).find(p=>p.id===match?.winner_id)?.first_name??(externalName&&match?.winner_id==null?externalName:"Winner");const loser=winner===person.first_name?(other?.first_name??externalName??"Opponent"):person.first_name??"Player";const email=kind==="locked"?plannedEmail({kind,firstName:person.first_name??"Player",opponentName:other?.first_name??externalName??"Opponent",when:new Intl.DateTimeFormat("en-AU",{dateStyle:"medium",timeStyle:"short"}).format(new Date(plan.scheduled_at)),location:plan.location}):plannedEmail({kind,firstName:person.first_name??"Player",winnerName:winner,loserName:loser,score:(match?.match_sets??[]).map((s:any)=>`${s.p1_games}-${s.p2_games}`).join(", "),type:match?.type==="ranked"?"Ranked · +30 / +15":"Non-ranked · +10"});await sendTournamentEmail(person.email,email,`planned/${plannedMatchId}/${kind}/${person.id}`);}}catch{/* committed lifecycle remains successful */}}

export type MarkNotificationsResult = { ok: true; count: number } | { ok: false; error: string };

export async function markNotificationsRead(): Promise<MarkNotificationsResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "Sign in first." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("player_id", player.id)
    .is("read_at", null)
    .select("id");
  if (error) return { ok: false, error: "Zeus couldn't update your notifications." };
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  return { ok: true, count: data?.length ?? 0 };
}

export async function openNotification(formData: FormData) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const id = String(formData.get("notificationId") ?? "");
  const db = await createClient();
  const { data } = await db.from("notifications").select("id, target_path, planned_match_id").eq("id", id).eq("player_id", player.id).single();
  if (!data) redirect("/notifications");
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id).eq("player_id", player.id);
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  const target = data.target_path ?? (data.planned_match_id ? `/matches/${data.planned_match_id}` : "/notifications");
  redirect(target.startsWith("/") ? target : "/notifications");
}
