"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { validateSubmission } from "./submission";
import type { MatchSubmission } from "./types";

export type SubmitResult = { ok: true; matchId: string } | { ok: false; error: string };

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
      played_at: new Date().toISOString(),
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

  revalidatePath("/matches");
  return { ok: true, matchId: created.id };
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
    .select("status")
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
