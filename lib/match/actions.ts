"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { validateExternalSubmission, validateSubmission } from "./submission";
import type { ExternalMatchSubmission, MatchSubmission } from "./types";
import { formatScore } from "./score";
import { renderExternalMatchEmail } from "./external-email";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { renderRankedMatchLoggedEmail } from "./submission-email";
import { displayName } from "@/lib/auth/displayName";
import { sendLifecycleEmail } from "@/lib/planned/actions";

export type SubmitResult = { ok: true; matchId: string; warning?: string } | { ok: false; error: string };

export type MatchActionResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = "Couldn't save the match — please try again.";

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

  const { data: created, error: matchError } = await supabase
    .from("matches")
    .insert({
      type: match.type,
      format: match.format,
      format_note: match.formatNote,
      player1_id: player.id,
      player2_id: match.opponentId,
      winner_id: match.winnerId,
      status: "pending_confirmation",
      submitted_by: player.id,
      played_at: match.playedAt,
      location: match.location,
    })
    .select("id")
    .single();

  if (matchError || !created) {
    return { ok: false, error: SAVE_FAILED };
  }

  // Sequential PostgREST inserts aren't one transaction, so if a later write
  // fails we compensate by deleting the just-created match (cascades to sets and
  // confirmations). A transactional RPC is the follow-up if this ever matters.
  const { error: setsError } = await supabase.from("match_sets").insert(
    match.sets.map((set) => ({
      match_id: created.id,
      set_number: set.setNumber,
      p1_games: set.selfGames,
      p2_games: set.opponentGames,
      tiebreak_p1: set.selfTiebreak,
      tiebreak_p2: set.opponentTiebreak,
    })),
  );
  if (setsError) {
    await supabase.from("matches").delete().eq("id", created.id);
    return { ok: false, error: SAVE_FAILED };
  }

  // The submitter has implicitly confirmed by submitting; the confirmation
  // trigger advances the result once both players have confirmed (ADR-0010).
  const { error: confirmError } = await supabase
    .from("match_confirmations")
    .insert({ match_id: created.id, player_id: player.id });
  if (confirmError) {
    await supabase.from("matches").delete().eq("id", created.id);
    return { ok: false, error: SAVE_FAILED };
  }

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
        sendTournamentEmail(player.email, renderRankedMatchLoggedEmail({ firstName: player.firstName ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10) }), `ranked-match/logged/${created.id}/${player.id}`),
        opponent?.email ? sendTournamentEmail(opponent.email, renderRankedMatchLoggedEmail({ firstName: opponent.first_name ?? "Player", winnerName, loserName, score, matchDate: match.playedAt.slice(0, 10), confirmUrl: `${base}/matches` }), `ranked-match/logged/${created.id}/${match.opponentId}`) : Promise.resolve(),
      ]);
    } catch { warning = "Match logged, but one or more result emails could not be sent."; }
  }

  revalidatePath("/matches");
  return { ok: true, matchId: created.id, warning };
}

export async function submitExternalMatch(input: ExternalMatchSubmission): Promise<SubmitResult> {
  const player = await getSessionPlayer();
  if (!player || player.status !== "active") return { ok: false, error: "You need to be signed in to log a match." };
  const validated = validateExternalSubmission(input, player.id);
  if (!validated.ok) return { ok: false, error: validated.error };
  const match = validated.value;
  const supabase = await createClient();
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

  try {
    await rebuildRatingCache();
  } catch {
    revalidatePath("/matches");
    revalidateRatingSurfaces();
    return { ok: false, error: "Match was logged, but ratings could not be rebuilt. Ask an admin to rebuild ratings." };
  }

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
  }

  revalidatePath("/matches");
  return { ok: true };
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

  const { error } = await supabase.from("matches").update({ status: to }).eq("id", matchId);
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
    if (match.planned_match_id) {
      const admin = createAdminClient();
      await admin.from("planned_matches").update({ status: "confirmed" }).eq("id", match.planned_match_id);
      await sendLifecycleEmail(match.planned_match_id, "confirmed", matchId);
    }
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
