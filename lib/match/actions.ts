"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateSubmission } from "./submission";
import type { MatchSubmission } from "./types";

export type SubmitResult = { ok: true; matchId: string } | { ok: false; error: string };

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

  // The submitter has implicitly confirmed by submitting; record their row. The
  // both-confirmed -> pending_approval transition stays deferred (ADR-0006).
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
