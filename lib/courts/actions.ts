"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SURFACES, type Surface } from "./types";

export type CourtActionResult = { ok: true; courtId?: string } | { ok: false; error: string };

export async function resolveCourtName(name: string): Promise<CourtActionResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "Sign in first." };
  if (player.status !== "active") return { ok: false, error: "You need an active account." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: true };
  if (trimmed.length > 160) return { ok: false, error: "Court name must be 160 characters or fewer." };
  const db = await createClient();
  const { data, error } = await db.rpc("resolve_court", { p_name: trimmed });
  if (error || !data) return { ok: false, error: "Couldn't save that court." };
  return { ok: true, courtId: data as string };
}

export async function tagMatchMetadata(input: {
  matchId: string;
  courtName: string;
  courtId?: string;
  surface: Surface | "";
}): Promise<CourtActionResult> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "Sign in first." };
  if (player.status !== "active") return { ok: false, error: "You need an active account." };
  if (input.surface && !SURFACES.includes(input.surface)) return { ok: false, error: "Choose a valid surface." };
  let courtId = input.courtId || undefined;
  if (input.courtName.trim() && !courtId) {
    const resolved = await resolveCourtName(input.courtName);
    if (!resolved.ok) return resolved;
    courtId = resolved.courtId;
  }
  const db = await createClient();
  const { error } = await db.rpc("tag_match_metadata", {
    p_match_id: input.matchId,
    p_court_id: courtId ?? null,
    p_surface: input.surface || null,
  });
  if (error) return { ok: false, error: "You can't tag that match." };
  const { error: dismissError } = await db.rpc("dismiss_untagged_notification_v1");
  if (dismissError) console.error("Could not reconcile the untagged-match nudge", dismissError);
  for (const path of ["/matches/untagged", "/matches", "/profile", "/notifications", "/"]) revalidatePath(path);
  return { ok: true, courtId };
}

export async function mergeCourts(
  _state: CourtActionResult | undefined,
  formData: FormData,
): Promise<CourtActionResult> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin" || player.status !== "active") return { ok: false, error: "Only active organisers can merge courts." };
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!sourceId || !targetId || sourceId === targetId) return { ok: false, error: "Choose two different courts." };
  const db = await createClient();
  const { error } = await db.rpc("merge_courts", { p_source_id: sourceId, p_target_id: targetId });
  if (error) return { ok: false, error: "Couldn't merge those courts." };
  for (const path of ["/admin/players", "/matches", "/tournaments", "/"]) revalidatePath(path);
  return { ok: true };
}
