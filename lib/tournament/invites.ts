"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sendTournamentEmail } from "./email";
import { renderCupInviteEmail } from "./invite-email";

export type InviteActionState = { ok: true; message: string } | { ok: false; error: string };

export async function sendCupInvites(_: InviteActionState | undefined, formData: FormData): Promise<InviteActionState> {
  const admin = await getSessionPlayer();
  if (admin?.role !== "admin") return { ok: false, error: "Only organisers can send cup invitations." };
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const ids = formData.getAll("playerIds").map(String);
  const deadline = String(formData.get("deadline") ?? "");
  const parsedDeadline = Date.parse(deadline);
  if (!tournamentId || ids.length === 0 || !Number.isFinite(parsedDeadline)) return { ok: false, error: "Choose players and a valid response deadline." };

  const db = await createClient();
  const { error: trophyError } = await db.rpc("configure_tournament_trophy_v1", { p_tournament_id: tournamentId, p_trophy_key: "claymore", p_trophy_name: "The Claymore" });
  if (trophyError) return { ok: false, error: "Couldn't configure this cup's trophy." };
  const { error } = await db.rpc("send_tournament_invites_v1", { p_tournament_id: tournamentId, p_player_ids: ids, p_hold_until: new Date(parsedDeadline).toISOString() });
  if (error) return { ok: false, error: "Couldn't send those invitations." };

  const [{ data: tournament }, { data: players }] = await Promise.all([
    db.from("tournaments").select("name,starts_at,timezone,location_name,cover_image_url,cover_frame_shape,cover_zoom,cover_offset_x,cover_offset_y").eq("id", tournamentId).single(),
    db.from("players").select("id,first_name,email").in("id", ids),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  let failed = tournament && siteUrl ? 0 : ids.length;
  if (tournament && siteUrl) for (const player of players ?? []) {
    try {
      await sendTournamentEmail(player.email, renderCupInviteEmail({
        firstName: player.first_name ?? "player", tournamentName: tournament.name, startsAt: tournament.starts_at,
        timezone: tournament.timezone, locationName: tournament.location_name, deadline,
        tournamentUrl: `${siteUrl}/tournaments/${tournamentId}`, assetBaseUrl: `${siteUrl}/emails`,
        coverImageUrl: tournament.cover_image_url, frameShape: tournament.cover_frame_shape, zoom: Number(tournament.cover_zoom),
        offsetX: Number(tournament.cover_offset_x), offsetY: Number(tournament.cover_offset_y),
      }), `tournament/${tournamentId}/invite/${player.id}`);
      await db.from("tournament_invites").update({ email_sent_at: new Date().toISOString() }).eq("tournament_id", tournamentId).eq("player_id", player.id);
    } catch { failed += 1; }
  }
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { ok: true, message: failed ? `Invites recorded; ${failed} emails need retry.` : `Sent ${ids.length} cup invitations.` };
}

export async function acceptCupInvite(tournamentId: string): Promise<InviteActionState> {
  if (!await getSessionPlayer()) return { ok: false, error: "Sign in to respond." };
  const { data, error } = await (await createClient()).rpc("respond_to_tournament_invite_v1", { p_tournament_id: tournamentId });
  revalidatePath(`/tournaments/${tournamentId}`);
  return error || data?.status === "expired"
    ? { ok: false, error: "That invitation has expired." }
    : { ok: true, message: "You're in. The director will confirm the final field." };
}
