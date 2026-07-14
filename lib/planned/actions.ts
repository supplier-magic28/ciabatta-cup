"use server";
import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { validateSubmission, validateExternalSubmission } from "@/lib/match/submission";
import type { MatchSubmission, ExternalMatchSubmission } from "@/lib/match/types";
import { formatScore } from "@/lib/match/score";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { matchLockedInEmail, resultConfirmedEmail } from "./email";
import {
  formatPlannedDateTime,
  formatPlayedDate,
  matchTypeLabel,
  resolveResultNames,
  type PlannedMatchFormat,
} from "./email-data";
import { queueUntaggedNudges } from "@/lib/notifications/untagged";
import { otherPlannedParticipant } from "./workflow";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const refresh = () => ["/", "/matches", "/profile", "/notifications", "/admin/approvals"].forEach((path) => revalidatePath(path));

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
    const externalInput=input as ExternalMatchSubmission; const {data:matchId,error}=await db.rpc("record_external_planned_result_v2",{p_planned_match_id:id,p_opponent_name:externalInput.opponentName,p_save_opponent:externalInput.saveOpponent,p_format:result.format,p_format_note:result.formatNote,p_external_won:result.externalWon,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface,p_sets:result.sets.map(s=>({set_number:s.setNumber,p1_games:s.selfGames,p2_games:s.opponentGames,tiebreak_p1:s.selfTiebreak,tiebreak_p2:s.opponentTiebreak}))}); if(error||!matchId)return {ok:false,error:error?.message??"Couldn't save result."}; try{await rebuildRatingCache();}catch{return {ok:false,error:"Result saved, but points need an admin rebuild."};} await queueUntaggedNudges(matchId as string); await sendLifecycleEmail(id,"confirmed",matchId as string); refresh();return {ok:true};
  }
  const result=checked.value as import("@/lib/match/types").ValidatedSubmission;
  const {error}=await db.rpc("submit_planned_result_v2",{p_planned_match_id:id,p_match_type:result.type,p_format:result.format,p_format_note:result.formatNote,p_winner_player_id:result.winnerId,p_score:result.sets,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface}); if(error)return {ok:false,error:error.message??"Couldn't submit result."}; refresh();return {ok:true};
}

export async function approvePlannedResult(id:string):Promise<Result>{const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const db=await createClient();const {data,error}=await db.rpc("approve_planned_result_v2",{p_planned_match_id:id});if(error)return {ok:false,error:error.message??"This result cannot be approved."};const row=Array.isArray(data)?data[0]:data;if(row?.match_status==="approved"&&row.match_id){try{await rebuildRatingCache();}catch{return {ok:false,error:"Result approved, but points need an admin rebuild."};}await queueUntaggedNudges(row.match_id);await sendLifecycleEmail(id,"confirmed",row.match_id);}refresh();return {ok:true,id:row?.match_id};}

export async function requestPlannedResultCorrection(id:string):Promise<Result>{const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const db=await createClient();const {error}=await db.rpc("request_planned_result_correction_v2",{p_planned_match_id:id});if(error)return {ok:false,error:error.message??"Couldn't request a correction."};refresh();return {ok:true};}

export async function correctPlannedResult(id:string,input:MatchSubmission):Promise<Result>{const player=await getSessionPlayer();if(!player||player.role!=="admin")return {ok:false,error:"Only organisers may correct results."};const db=await createClient();const [{data:plan},{data:prior}]=await Promise.all([db.from("planned_matches").select("created_by,opponent_player_id").eq("id",id).single(),db.from("planned_match_results").select("submitted_by").eq("planned_match_id",id).order("created_at",{ascending:false}).limit(1).single()]);if(!plan||!plan.opponent_player_id||!prior)return {ok:false,error:"Result proposal not found."};const other=prior.submitted_by===plan.created_by?plan.opponent_player_id:plan.created_by;const checked=validateSubmission({...input,opponentId:other},prior.submitted_by);if(!checked.ok)return checked;let courtId:string|null=null;if(checked.value.location){const {data:resolved,error:courtError}=await db.rpc("resolve_court",{p_name:checked.value.location});if(courtError||!resolved)return {ok:false,error:"Couldn't save that court."};courtId=resolved as string;}const result=checked.value;const {error}=await db.rpc("correct_planned_result_v2",{p_planned_match_id:id,p_match_type:result.type,p_format:result.format,p_format_note:result.formatNote,p_winner_player_id:result.winnerId,p_score:result.sets,p_played_at:result.playedAt,p_location:result.location,p_court_id:courtId,p_surface:result.surface});if(error)return {ok:false,error:error.message??"Couldn't save the correction."};refresh();return {ok:true};}

export async function sendLifecycleEmail(
  plannedMatchId: string,
  kind: "locked" | "confirmed",
  matchId?: string,
) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (!siteUrl) throw new Error("Planned-match email URL is not configured.");

    const admin = createAdminClient();
    const { data: plan } = await admin
      .from("planned_matches")
      .select("*, external_opponents(display_name)")
      .eq("id", plannedMatchId)
      .single();
    if (!plan) return;

    const ids = [plan.created_by, plan.opponent_player_id].filter(
      (id): id is string => Boolean(id),
    );
    const { data: people } = await admin
      .from("players")
      .select("id,email,first_name")
      .in("id", ids);
    const recipients = people ?? [];
    const relation = plan.external_opponents as
      | { display_name: string }
      | Array<{ display_name: string }>
      | null;
    const externalName = Array.isArray(relation)
      ? relation[0]?.display_name ?? null
      : relation?.display_name ?? null;
    const assetBaseUrl = `${siteUrl}/emails`;

    type LifecycleMatch = {
      winner_id: string | null;
      type: "ranked" | "exhibition" | "unranked_external";
      format: PlannedMatchFormat;
      format_note: string | null;
      external_won: boolean;
      player1_id: string;
      player2_id: string | null;
      played_at: string;
      match_sets: Array<{
        set_number: number;
        p1_games: number;
        p2_games: number;
        tiebreak_p1: number | null;
        tiebreak_p2: number | null;
      }>;
    };
    let match: LifecycleMatch | null = null;
    if (matchId) {
      const { data } = await admin
        .from("matches")
        .select("winner_id,type,format,format_note,external_won,player1_id,player2_id,played_at,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)")
        .eq("id", matchId)
        .single();
      match = data as LifecycleMatch | null;
    }

    for (const person of recipients) {
      const other = recipients.find((candidate) => candidate.id !== person.id);
      const email = kind === "locked"
        ? matchLockedInEmail({
            firstName: person.first_name ?? "Player",
            opponentName: other?.first_name ?? externalName ?? "Opponent",
            matchDateTime: formatPlannedDateTime(plan.scheduled_at),
            location: plan.location.trim() || "To be decided",
            matchUrl: `${siteUrl}/matches/${plannedMatchId}`,
            assetBaseUrl,
            externalOpponent: plan.opponent_player_id === null,
          })
        : (() => {
            if (!match) throw new Error("Confirmed planned match is missing its match fact.");
            const names = resolveResultNames({
              player1Id: match.player1_id,
              player2Id: match.player2_id,
              winnerId: match.winner_id,
              externalWon: match.external_won,
              externalName,
              players: recipients.map((player) => ({
                id: player.id,
                firstName: player.first_name ?? "Player",
              })),
            });
            const sets = [...(match.match_sets ?? [])].sort(
              (left, right) => left.set_number - right.set_number,
            );
            return resultConfirmedEmail({
              ...names,
              score: formatScore(sets.map((set) => ({
                p1Games: set.p1_games,
                p2Games: set.p2_games,
                tiebreakP1: set.tiebreak_p1,
                tiebreakP2: set.tiebreak_p2,
              }))),
              matchTypeLabel: matchTypeLabel(match.type, match.format, match.format_note),
              matchDate: formatPlayedDate(match.played_at),
              scoringVariant: match.type === "ranked"
                ? "ranked"
                : match.type === "exhibition"
                  ? "exhibition"
                  : "external",
              ladderUrl: `${siteUrl}/`,
              assetBaseUrl,
            });
          })();

      await sendTournamentEmail(
        person.email,
        email,
        `planned/${plannedMatchId}/${kind}/${person.id}`,
      );
    }
  } catch {
    // Email remains non-blocking after the lifecycle transition has committed.
  }
}

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

export async function openNotification(notificationId: string): Promise<{ok:true;target:string}|{ok:false;error:string}> {
  const player = await getSessionPlayer();
  if (!player) return {ok:false,error:"Sign in first."};
  const db = await createClient();
  const { data,error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId).eq("player_id", player.id).select("target_path,planned_match_id").single();
  if(error||!data)return {ok:false,error:"Zeus couldn't open that notification."};
  const target = data.target_path ?? (data.planned_match_id ? `/matches/${data.planned_match_id}` : "/notifications");
  return {ok:true,target:target.startsWith("/")?target:"/notifications"};
}
