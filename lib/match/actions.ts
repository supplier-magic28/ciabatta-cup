"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { validateAdminSubmission, validateExternalSubmission, validateSubmission } from "./submission";
import type { AdminMatchSubmission, ExternalMatchSubmission, MatchSubmission } from "./types";
import { formatScore } from "./score";
import { renderExternalMatchEmail } from "./external-email";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { renderRankedMatchLoggedEmail } from "./submission-email";
import { displayName } from "@/lib/auth/displayName";
import { sendLifecycleEmail } from "@/lib/planned/actions";
import { queueUntaggedNudges } from "@/lib/notifications/untagged";

export type SubmitResult = { ok: true; matchId: string; warning?: string } | { ok: false; error: string };

export type MatchActionResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = "Couldn't save the match — please try again.";

async function resolveCourtId(db: Awaited<ReturnType<typeof createClient>>, location: string | null) {
  if (!location) return null;
  const { data, error } = await db.rpc("resolve_court", { p_name: location });
  if (error || !data) throw new Error("court resolution failed");
  return data as string;
}

/**
 * Persist a submitted match as immutable facts (Phase 3c-part-1, ADR-0008).
 *
 * Writes `matches` (status `pending_confirmation`), its `match_sets`, and the
 * submitter's `match_confirmations` row — nothing else. It does NOT auto-approve,
 * compute scoring, or touch ratings; the opponent's confirmation and admin
 * approval are later phases. All writes go through the caller's authenticated
 * client, so RLS applies; validation is re-run server-side (never trust the
 * client). Server Functions are reachable by direct POST, so we re-check auth.
 */
export async function submitMatch(input: MatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in to log a match." };

  const validated = validateSubmission(input, player.id);
  if (!validated.ok) return { ok: false, error: validated.error };
  const match = validated.value;

  const supabase = await createClient();
  let courtId: string | null;
  try { courtId = await resolveCourtId(supabase, match.location); }
  catch { return { ok: false, error: "Couldn't save that court." }; }

  const {data:matchId,error:matchError}=await supabase.rpc("submit_match_v2",{p_opponent_id:match.opponentId,p_match_type:match.type,p_format:match.format,p_format_note:match.formatNote,p_winner_player_id:match.winnerId,p_played_at:match.playedAt,p_location:match.location,p_court_id:courtId,p_surface:match.surface,p_sets:match.sets.map(set=>({set_number:set.setNumber,p1_games:set.selfGames,p2_games:set.opponentGames,tiebreak_p1:set.selfTiebreak,tiebreak_p2:set.opponentTiebreak}))});
  if(matchError||typeof matchId!=="string")return {ok:false,error:SAVE_FAILED};

  let warning: string | undefined;
  if (match.type === "ranked") {
    const { data: opponent } = await supabase.from("players").select("email, first_name, last_name, nickname, use_nickname").eq("id", match.opponentId).single();
    const selfName = displayName({ firstName: player.firstName, lastName: player.lastName, email: player.email });
    const opponentName = opponent ? displayName({ firstName: opponent.first_name, lastName: opponent.last_name, email: opponent.email, nickname: opponent.nickname, useNickname: opponent.use_nickname }) : "Opponent";
    const winnerName = match.winnerId === player.id ? selfName : opponentName;
    const loserName = match.winnerId === player.id ? opponentName : selfName;
    const score = formatScore(match.sets.map((set) => ({ p1Games: set.selfGames, p2Games: set.opponentGames, tiebreakP1: set.selfTiebreak, tiebreakP2: set.opponentTiebreak })));
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    try {
      await Promise.all([
        sendTournamentEmail(player.email, renderRankedMatchLoggedEmail({ firstName: player.firstName ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10) }), `ranked-match/logged/${matchId}/${player.id}`),
        opponent?.email ? sendTournamentEmail(opponent.email, renderRankedMatchLoggedEmail({ firstName: opponent.first_name ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10), confirmUrl: `${base}/matches` }), `ranked-match/logged/${matchId}/${match.opponentId}`) : Promise.resolve(),
      ]);
    } catch { warning = "Match logged, but one or more result emails could not be sent."; }
  }

  revalidatePath("/matches");
  return { ok: true, matchId, warning };
}

export async function adminLogMatch(input: AdminMatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin") return { ok: false, error: "Only admins can directly log matches." };
  const validated = validateAdminSubmission(input);
  if (!validated.ok) return validated;
  const match = validated.value;
  const supabase = await createClient();
  let courtId: string | null;
  try { courtId = await resolveCourtId(supabase, match.location); }
  catch { return { ok: false, error: "Couldn't save that court." }; }
  const { data: matchId, error } = await supabase.rpc("admin_log_match_v1", {
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
  let warning: string | undefined;
  try { await rebuildRatingCache(); }
  catch { warning = "Match approved, but the derived points cache needs an admin rebuild."; }
  await queueUntaggedNudges(matchId);
  revalidatePath("/matches");
  revalidatePath("/admin/approvals");
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
  const { data: matchId, error } = await supabase.rpc("log_external_match", {
    p_opponent_name: match.opponentName,
    p_save_opponent: match.saveOpponent,
    p_format: match.format,
    p_format_note: match.formatNote,
    p_external_won: match.externalWon,
    p_played_at: match.playedAt,
    p_location: match.location,
    p_sets: match.sets.map((set) => ({
      set_number: set.setNumber, p1_games: set.selfGames, p2_games: set.opponentGames,
      tiebreak_p1: set.selfTiebreak, tiebreak_p2: set.opponentTiebreak,
    })),
  });
  if (error || typeof matchId !== "string") return { ok: false, error: SAVE_FAILED };
  if (courtId || match.surface) {
    const { error: metadataError } = await createAdminClient().from("matches").update({ court_id: courtId, surface: match.surface, location: match.location }).eq("id", matchId);
    if (metadataError) return { ok: false, error: "Match logged, but its court metadata could not be saved." };
  }

  try {
    await rebuildRatingCache();
  } catch {
    revalidatePath("/matches");
    revalidateRatingSurfaces();
    return { ok: false, error: "Match was logged, but ratings could not be rebuilt. Ask an admin to rebuild ratings." };
  }
  await queueUntaggedNudges(matchId);

  let warning: string | undefined;
  try {
    const score = formatScore(match.sets.map((set) => ({
      p1Games: set.selfGames, p2Games: set.opponentGames,
      tiebreakP1: set.selfTiebreak, tiebreakP2: set.opponentTiebreak,
    })));
    await sendTournamentEmail(player.email, renderExternalMatchEmail({
      firstName: player.firstName ?? "Player", opponentName: match.opponentName,
      score, won: !match.externalWon,
    }), `external-match/${matchId}/${player.id}`);
  } catch {
    warning = "Match logged and +10 points applied, but the result email could not be sent.";
  }

  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return { ok: true, matchId, warning };
}

export async function deleteExternalMatch(
  _previous: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const player = await getSessionPlayer();
  if (!player) return { error: "You need to be signed in." };
  const matchId = String(formData.get("matchId") ?? "");
  if (!matchId) return { error: "Match not found." };
  const supabase = await createClient();
  const { data: deleted, error } = await supabase.rpc("delete_own_external_match", { p_match_id: matchId });
  if (error || deleted !== true) return { error: "Couldn't delete this match. It may not belong to you." };
  try {
    await rebuildRatingCache();
  } catch {
    revalidatePath("/matches");
    revalidateRatingSurfaces();
    return { error: "Match deleted, but ratings need an admin rebuild." };
  }
  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return undefined;
}

/**
 * Confirm a match you're a participant in (Phase 3c-part-2, ADR-0010). Inserts
 * the caller's `match_confirmations` row — RLS enforces that they are a
 * participant of a `pending_confirmation` match. Once both participants have
 * confirmed, the `advance_on_confirmation` trigger moves the status forward
 * (ranked → `pending_approval`, exhibition → `approved`). No scoring here.
 */
export async function confirmMatch(matchId: string): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("match_confirmations")
    .insert({ match_id: matchId, player_id: player.id });

  if (error) {
    // RLS denial, already-confirmed (PK), or no-longer-pending.
    return { ok: false, error: "Couldn't confirm this match — it may already be confirmed." };
  }

  const { data: advanced } = await supabase.from("matches").select("type, status").eq("id", matchId).single();
  if (advanced?.type === "exhibition" && advanced.status === "approved") {
    try { await rebuildRatingCache(); }
    catch { return { ok: false, error: "Match confirmed, but points need an admin rebuild." }; }
    revalidateRatingSurfaces();
    await queueUntaggedNudges(matchId);
  }

  revalidatePath("/matches");
  return { ok: true };
}

export async function resubmitQueriedMatch(matchId:string,input:MatchSubmission):Promise<MatchActionResult>{
  const player=await getSessionPlayer();if(!player)return {ok:false,error:"Sign in first."};const db=await createClient();
  const {data:match}=await db.from("matches").select("id,player1_id,player2_id,submitted_by,status,planned_match_id").eq("id",matchId).single();
  if(!match||match.status!=="queried"||match.submitted_by!==player.id||match.planned_match_id)return {ok:false,error:"This queried match cannot be edited."};
  const opponentId=match.player1_id===player.id?match.player2_id:match.player1_id;const checked=validateSubmission({...input,opponentId},player.id);if(!checked.ok)return checked;
  let courtId:string|null=null;try{courtId=await resolveCourtId(db,checked.value.location);}catch{return {ok:false,error:"Couldn't save that court."};}
  const v=checked.value;const firstIsSelf=match.player1_id===player.id;const sets=v.sets.map(s=>({set_number:s.setNumber,p1_games:firstIsSelf?s.selfGames:s.opponentGames,p2_games:firstIsSelf?s.opponentGames:s.selfGames,tiebreak_p1:firstIsSelf?s.selfTiebreak:s.opponentTiebreak,tiebreak_p2:firstIsSelf?s.opponentTiebreak:s.selfTiebreak}));
  const {error}=await db.rpc("resubmit_queried_match_v2",{p_match_id:matchId,p_match_type:v.type,p_format:v.format,p_format_note:v.formatNote,p_winner_player_id:v.winnerId,p_played_at:v.playedAt,p_location:v.location,p_court_id:courtId,p_surface:v.surface,p_sets:sets});
  if(error)return {ok:false,error:error.message||"Couldn't resubmit this result."};revalidatePath("/matches");return {ok:true};
}

/**
 * Admin-only transition of a `pending_approval` match to a terminal decision.
 * Admin-gated in code (Server Actions are POST-reachable) and at the DB by the
 * `matches_update_admin` (`is_admin()`) RLS policy. Ranked approval then rebuilds
 * the derived rating cache from the complete set of immutable match facts.
 */
async function adminSetStatus(
  matchId: string,
  to: "approved" | "queried" | "rejected",
): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin") {
    return { ok: false, error: "Only admins can review matches." };
  }

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("status, planned_match_id")
    .eq("id", matchId)
    .single();

  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "pending_approval") {
    return { ok: false, error: "This match isn't awaiting approval." };
  }

  const { error } = await supabase.rpc("review_match_v2", { p_match_id: matchId, p_decision: to });
  if (error) return { ok: false, error: "Couldn't update this match — please try again." };

  if (to === "approved") {
    try {
      // A late approval can alter every later Elo step, so rebuild from all
      // immutable facts instead of trying to apply one incremental delta.
      await rebuildRatingCache();
    } catch {
      revalidatePath("/admin/approvals");
      revalidatePath("/matches");
      revalidateRatingSurfaces();
      return {
        ok: false,
        error: "Match was approved, but ratings could not be rebuilt. Check the server configuration.",
      };
    }
    if (match.planned_match_id) await sendLifecycleEmail(match.planned_match_id, "confirmed", matchId);
    await queueUntaggedNudges(matchId);
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/matches");
  revalidateRatingSurfaces();
  return { ok: true };
}

function revalidateRatingSurfaces() {
  revalidatePath("/");
  revalidatePath("/players/[playerId]", "page");
}

/** Rebuild all derived rating data; an admin recovery path after deployment. */
export async function rebuildRatings(): Promise<MatchActionResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin") {
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
