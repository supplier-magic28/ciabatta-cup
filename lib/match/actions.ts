"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { rebuildScoringAfterCommit } from "@/lib/workflow/post-commit";
import { validateAdminSubmission, validateExternalSubmission, validateSubmission } from "./submission";
import type { AdminMatchSubmission, ExternalMatchSubmission, MatchSubmission } from "./types";
import { formatScore } from "./score";
import { renderExternalMatchEmail } from "./external-email";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { renderRankedMatchLoggedEmail } from "./submission-email";
import { displayName } from "@/lib/auth/displayName";
import { sendLifecycleEmail } from "@/lib/planned/actions";
import { committedEmailWarning, type CommittedEmailWarning } from "@/lib/email/delivery";

export type SubmitResult = { ok: true; matchId: string; warning?: string; deliveryWarning?: CommittedEmailWarning } | { ok: false; error: string };

export type MatchActionResult = { ok: true; warning?: string; deliveryWarning?: CommittedEmailWarning } | { ok: false; error: string };

const SAVE_FAILED = "Couldn't save the match — please try again.";

async function resolveCourtId(db: Awaited<ReturnType<typeof createClient>>, location: string | null) {
  if (!location) return null;
  const { data, error } = await db.rpc("resolve_court", { p_name: location });
  if (error || !data) throw new Error("court resolution failed");
  return data as string;
}

/**
 * Submit a match through the transactional workflow boundary (ADR-0008,
 * ADR-0036, WF-MATCH-001).
 *
 * `submit_match_v3` atomically validates the active actor, creates the match,
 * sets, initial confirmation, Zeus events, and durable email intents. Ranked
 * submissions await opponent confirmation and organiser approval; exhibition
 * follows its documented automatic terminal path. Derived scoring is rebuilt
 * only after an authoritative scoring transition commits.
 */
export async function submitMatch(input: MatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in to log a match." };
  if (player.status !== "active") return { ok: false, error: "You need an active account to log a match." };

  const validated = validateSubmission(input, player.id);
  if (!validated.ok) return { ok: false, error: validated.error };
  const match = validated.value;

  const supabase = await createClient();
  let courtId: string | null;
  try { courtId = await resolveCourtId(supabase, match.location); }
  catch { return { ok: false, error: "Couldn't save that court." }; }

  const {data:matchId,error:matchError}=await supabase.rpc("submit_match_v3",{p_operation_key:input.operationKey??crypto.randomUUID(),p_opponent_id:match.opponentId,p_match_type:match.type,p_format:match.format,p_format_note:match.formatNote,p_winner_player_id:match.winnerId,p_played_at:match.playedAt,p_location:match.location,p_court_id:courtId,p_surface:match.surface,p_sets:match.sets.map(set=>({set_number:set.setNumber,p1_games:set.selfGames,p2_games:set.opponentGames,tiebreak_p1:set.selfTiebreak,tiebreak_p2:set.opponentTiebreak}))});
  if(matchError||typeof matchId!=="string")return {ok:false,error:SAVE_FAILED};

  let warning: string | undefined;
  let deliveryWarning: CommittedEmailWarning | undefined;
  if (match.type === "ranked") {
    const { data: opponent } = await supabase.from("players").select("email, first_name, last_name, nickname, use_nickname").eq("id", match.opponentId).single();
    const selfName = displayName({ firstName: player.firstName, lastName: player.lastName, email: player.email });
    const opponentName = opponent ? displayName({ firstName: opponent.first_name, lastName: opponent.last_name, email: opponent.email, nickname: opponent.nickname, useNickname: opponent.use_nickname }) : "Opponent";
    const winnerName = match.winnerId === player.id ? selfName : opponentName;
    const loserName = match.winnerId === player.id ? opponentName : selfName;
    const score = formatScore(match.sets.map((set) => ({ p1Games: set.selfGames, p2Games: set.opponentGames, tiebreakP1: set.selfTiebreak, tiebreakP2: set.opponentTiebreak })));
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    try {
      if (!opponent?.email) throw new Error("The complete ranked-match email recipient set is unavailable.");
      await Promise.all([
        sendTournamentEmail(player.email, renderRankedMatchLoggedEmail({ firstName: player.firstName ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10) }), `ranked-match/logged/${matchId}/${player.id}`, {kind:"ranked_match_logged",playerId:player.id,entityType:"match",entityId:matchId}),
        sendTournamentEmail(opponent.email, renderRankedMatchLoggedEmail({ firstName: opponent.first_name ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10), confirmUrl: `${base}/matches` }), `ranked-match/logged/${matchId}/${match.opponentId}`, {kind:"ranked_match_logged",playerId:match.opponentId,entityType:"match",entityId:matchId}),
      ]);
    } catch {
      warning = "Match logged, but one or more result emails could not be sent.";
      deliveryWarning = committedEmailWarning(warning, [
        `ranked-match/logged/${matchId}/${player.id}`,
        `ranked-match/logged/${matchId}/${match.opponentId}`,
      ]);
    }
  }

  revalidatePath("/matches");
  return { ok: true, matchId, warning, deliveryWarning };
}

export async function adminLogMatch(input: AdminMatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin" || player.status !== "active") return { ok: false, error: "Only active admins can directly log matches." };
  const validated = validateAdminSubmission(input);
  if (!validated.ok) return validated;
  const match = validated.value;
  const supabase = await createClient();
  let courtId: string | null;
  try { courtId = await resolveCourtId(supabase, match.location); }
  catch { return { ok: false, error: "Couldn't save that court." }; }
  const { data: matchId, error } = await supabase.rpc("admin_log_match_v2", {
    p_operation_key: input.operationKey ?? crypto.randomUUID(),
    p_player1_id: input.player1Id,
    p_player2_id: input.player2Id,
    p_match_type: match.type,
    p_format: match.format,
    p_format_note: match.formatNote,
    p_winner_player_id: match.winnerId,
    p_played_at: match.playedAt,
    p_location: match.location,
    p_court_id: courtId,
    p_surface: match.surface,
    p_sets: match.sets.map((set) => ({
      set_number: set.setNumber, p1_games: set.selfGames, p2_games: set.opponentGames,
      tiebreak_p1: set.selfTiebreak, tiebreak_p2: set.opponentTiebreak,
    })),
  });
  if (error || typeof matchId !== "string") return { ok: false, error: error?.message || SAVE_FAILED };
  const warning = await rebuildScoringAfterCommit(matchId, "admin_log_match");
  revalidatePath("/matches");
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/health");
  revalidateRatingSurfaces();
  return { ok: true, matchId, warning };
}

export async function submitExternalMatch(input: ExternalMatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player || player.status !== "active") return { ok: false, error: "You need to be signed in to log a match." };
  const validated = validateExternalSubmission(input, player.id);
  if (!validated.ok) return { ok: false, error: validated.error };
  const match = validated.value;
  const supabase = await createClient();
  let courtId: string | null;
  try { courtId = await resolveCourtId(supabase, match.location); }
  catch { return { ok: false, error: "Couldn't save that court." }; }
  const { data: matchId, error } = await supabase.rpc("log_external_match_v2", {
    p_operation_key: input.operationKey ?? crypto.randomUUID(),
    p_opponent_name: match.opponentName,
    p_save_opponent: match.saveOpponent,
    p_format: match.format,
    p_format_note: match.formatNote,
    p_external_won: match.externalWon,
    p_played_at: match.playedAt,
    p_location: match.location,
    p_court_id: courtId,
    p_surface: match.surface,
    p_sets: match.sets.map((set) => ({
      set_number: set.setNumber, p1_games: set.selfGames, p2_games: set.opponentGames,
      tiebreak_p1: set.selfTiebreak, tiebreak_p2: set.opponentTiebreak,
    })),
  });
  if (error || typeof matchId !== "string") return { ok: false, error: SAVE_FAILED };
  let warning = await rebuildScoringAfterCommit(matchId, "log_external_match");
  let deliveryWarning: CommittedEmailWarning | undefined;
  try {
    const score = formatScore(match.sets.map((set) => ({
      p1Games: set.selfGames, p2Games: set.opponentGames,
      tiebreakP1: set.selfTiebreak, tiebreakP2: set.opponentTiebreak,
    })));
    await sendTournamentEmail(player.email, renderExternalMatchEmail({
      firstName: player.firstName ?? "Player", opponentName: match.opponentName,
      score, won: !match.externalWon,
    }), `external-match/${matchId}/${player.id}`, {kind:"external_match_logged",playerId:player.id,entityType:"match",entityId:matchId});
  } catch {
    warning = [warning, "The match was saved, but its result email could not be sent."].filter(Boolean).join(" ");
    deliveryWarning = committedEmailWarning(
      "The match was saved, but its result email needs recovery.",
      [`external-match/${matchId}/${player.id}`],
    );
  }

  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return { ok: true, matchId, warning, deliveryWarning };
}

export async function deleteExternalMatch(
  _previous: { error?: string; warning?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; warning?: string } | undefined> {
  const player = await getSessionPlayer();
  if (!player) return { error: "You need to be signed in." };
  if (player.status !== "active") return { error: "You need an active account." };
  const matchId = String(formData.get("matchId") ?? "");
  if (!matchId) return { error: "Match not found." };
  const supabase = await createClient();
  const { data: deleted, error } = await supabase.rpc("delete_own_external_match", { p_match_id: matchId });
  if (error || deleted !== true) return { error: "Couldn't delete this match. It may not belong to you." };
  const warning = await rebuildScoringAfterCommit(matchId, "delete_external_match");
  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return warning ? { warning } : undefined;
}

/**
 * Confirm through the row-locking `confirm_match_v1` boundary (ADR-0010).
 * The RPC validates actor and status, records confirmation idempotently, and
 * performs the allowed transition atomically. An exhibition approval changes
 * scoring facts, so its rebuild is a separate reconstructable post-commit step.
 */
export async function confirmMatch(matchId: string): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in." };
  if (player.status !== "active") return { ok: false, error: "You need an active account." };

  const supabase = await createClient();
  const { data: status, error } = await supabase.rpc("confirm_match_v1", { p_match_id: matchId });

  if (error) {
    // Preserve the transactional boundary's unavailable/already-complete result.
    return { ok: false, error: "Couldn't confirm this match — it may already be confirmed." };
  }

  let warning: string | undefined;
  if (status === "approved") {
    warning = await rebuildScoringAfterCommit(matchId, "confirm_match");
    revalidateRatingSurfaces();
  }

  revalidatePath("/matches");
  return { ok: true, warning };
}

export async function resubmitQueriedMatch(matchId:string,input:MatchSubmission):Promise<MatchActionResult>{
  const player=await getSessionPlayer();if(!player||player.status!=="active")return {ok:false,error:"You need an active account."};const db=await createClient();
  const {data:match}=await db.from("matches").select("id,player1_id,player2_id,submitted_by,status,planned_match_id").eq("id",matchId).single();
  if(!match||match.status!=="queried"||match.submitted_by!==player.id||match.planned_match_id)return {ok:false,error:"This queried match cannot be edited."};
  const opponentId=match.player1_id===player.id?match.player2_id:match.player1_id;const checked=validateSubmission({...input,opponentId},player.id);if(!checked.ok)return checked;
  let courtId:string|null=null;try{courtId=await resolveCourtId(db,checked.value.location);}catch{return {ok:false,error:"Couldn't save that court."};}
  const v=checked.value;const firstIsSelf=match.player1_id===player.id;const sets=v.sets.map(s=>({set_number:s.setNumber,p1_games:firstIsSelf?s.selfGames:s.opponentGames,p2_games:firstIsSelf?s.opponentGames:s.selfGames,tiebreak_p1:firstIsSelf?s.selfTiebreak:s.opponentTiebreak,tiebreak_p2:firstIsSelf?s.opponentTiebreak:s.selfTiebreak}));
  const {error}=await db.rpc("resubmit_queried_match_v3",{p_match_id:matchId,p_match_type:v.type,p_format:v.format,p_format_note:v.formatNote,p_winner_player_id:v.winnerId,p_played_at:v.playedAt,p_location:v.location,p_court_id:courtId,p_surface:v.surface,p_sets:sets});
  if(error)return {ok:false,error:error.message||"Couldn't resubmit this result."};revalidatePath("/matches");return {ok:true};
}

/**
 * Active-organiser transition through the row-locking `review_match_v2` RPC.
 * The authoritative decision and lifecycle notifications commit together;
 * public activity points and the separate Elo projection rebuild afterward.
 */
async function adminSetStatus(
  matchId: string,
  to: "approved" | "queried" | "rejected",
): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin" || player.status !== "active") {
    return { ok: false, error: "Only admins can review matches." };
  }

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("status, planned_match_id")
    .eq("id", matchId)
    .single();

  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "pending_approval" && match.status !== to) {
    return { ok: false, error: "This match isn't awaiting approval." };
  }

  const { error } = await supabase.rpc("review_match_v2", { p_match_id: matchId, p_decision: to });
  if (error) return { ok: false, error: "Couldn't update this match — please try again." };

  let warning: string | undefined;
  let deliveryWarning: CommittedEmailWarning | undefined;
  if (to === "approved") {
    warning = await rebuildScoringAfterCommit(matchId, "review_match");
    if (match.planned_match_id) deliveryWarning = await sendLifecycleEmail(match.planned_match_id, "confirmed", matchId);
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return { ok: true, warning, deliveryWarning };
}

function revalidateRatingSurfaces() {
  revalidatePath("/");
  revalidatePath("/players/[playerId]", "page");
}

/** Rebuild public activity points and the separate Elo projection. */
export async function rebuildRatings(): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin" || player.status !== "active") {
    return { ok: false, error: "Only admins can rebuild ratings." };
  }

  try {
    await rebuildRatingCache();
  } catch {
    return { ok: false, error: "Couldn't rebuild ratings. Check the server configuration." };
  }

  revalidatePath("/admin/approvals");
  revalidateRatingSurfaces();
  return { ok: true };
}

export async function approveMatch(matchId: string): Promise<MatchActionResult> {
  return adminSetStatus(matchId, "approved");
}

export async function queryMatch(matchId: string): Promise<MatchActionResult> {
  return adminSetStatus(matchId, "queried");
}

export async function rejectMatch(matchId: string): Promise<MatchActionResult> {
  return adminSetStatus(matchId, "rejected");
}
