import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTournamentEmail } from "./email";
import { renderCupInviteEmail } from "./invite-email";
import type { EmailDeliveryBatch } from "./delivery";

export type CupInviteDelivery = {
  playerId: string;
  generation: number;
};

type InviteRow = {
  player_id: string;
  generation: number;
  status: string;
  hold_until: string;
};

export async function deliverCupInviteEmails(
  tournamentId: string,
  deliveries: CupInviteDelivery[],
  expectedKey?: string,
): Promise<EmailDeliveryBatch> {
  const unique = new Map(deliveries.map((delivery) => [delivery.playerId, delivery]));
  if (unique.size !== deliveries.length || deliveries.some((delivery) => !Number.isInteger(delivery.generation) || delivery.generation < 1)) {
    throw new Error("Cup invitation delivery context is invalid.");
  }
  const playerIds = [...unique.keys()];
  if (playerIds.length === 0) return { attempted:0, delivered:0, failed:0, deliveryKeys:[] };

  const admin = createAdminClient();
  const [
    { data: tournament },
    { data: players },
    { data: inviteRows },
  ] = await Promise.all([
    admin.from("tournaments").select("name,starts_at,timezone,location_name,cover_image_url,cover_frame_shape,cover_zoom,cover_offset_x,cover_offset_y").eq("id", tournamentId).single(),
    admin.from("players").select("id,first_name,email").in("id", playerIds),
    admin.from("tournament_invites").select("player_id,generation,status,hold_until").eq("tournament_id", tournamentId).in("player_id", playerIds),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!tournament || !siteUrl) throw new Error("Cup invitation email is not configured.");
  if ((players ?? []).length !== playerIds.length || (inviteRows ?? []).length !== playerIds.length) {
    throw new Error("The complete cup invitation recipient set is unavailable.");
  }
  const playerById = new Map((players ?? []).map((player) => [player.id, player]));
  const inviteById = new Map((inviteRows as InviteRow[]).map((invite) => [invite.player_id, invite]));
  const result: EmailDeliveryBatch = {
    attempted: playerIds.length,
    delivered: 0,
    failed: 0,
    deliveryKeys: [],
  };

  for (const requested of deliveries) {
    const player = playerById.get(requested.playerId);
    const invite = inviteById.get(requested.playerId);
    const key = `tournament/${tournamentId}/invite/${requested.playerId}/g${requested.generation}`;
    result.deliveryKeys.push(key);
    if (!player?.email || !invite || !["sent","opened"].includes(invite.status) || invite.generation !== requested.generation || (expectedKey && key !== expectedKey)) {
      result.failed += 1;
      continue;
    }
    try {
      await sendTournamentEmail(player.email, renderCupInviteEmail({
        firstName: player.first_name ?? "player",
        tournamentName: tournament.name,
        startsAt: tournament.starts_at,
        timezone: tournament.timezone,
        locationName: tournament.location_name,
        deadline: invite.hold_until,
        tournamentUrl: `${siteUrl}/tournaments/${tournamentId}`,
        assetBaseUrl: `${siteUrl}/emails`,
        coverImageUrl: tournament.cover_image_url,
        frameShape: tournament.cover_frame_shape,
        zoom: Number(tournament.cover_zoom),
        offsetX: Number(tournament.cover_offset_x),
        offsetY: Number(tournament.cover_offset_y),
      }), key, {
        kind: "tournament_invite",
        playerId: player.id,
        entityType: "tournament",
        entityId: tournamentId,
      });
      result.delivered += 1;
    } catch (error) {
      console.error("Cup invitation email delivery failed", { idempotencyKey:key, error });
      result.failed += 1;
    }
  }
  return result;
}
