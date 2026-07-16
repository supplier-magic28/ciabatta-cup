"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { committedEmailWarning, type CommittedEmailWarning } from "@/lib/email/delivery";
import { deliverCupInviteEmails } from "./invite-delivery";

export type InviteActionState = { ok: true; message: string; deliveryWarning?: CommittedEmailWarning } | { ok: false; error: string };

function localDateTimeToIso(value: string, offsetMinutes: number) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !Number.isFinite(offsetMinutes)) return null;
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute) + offsetMinutes * 60_000;
  return new Date(utc).toISOString();
}

function inviteSendError(message: string) {
  if (message.includes("final field")) return "The final field is already locked.";
  if (message.includes("closed")) return "Cup invitations are closed.";
  if (message.includes("future")) return "Choose a response deadline in the future.";
  if (message.includes("active")) return "Only active players can be invited.";
  if (message.includes("unique")) return "Choose each player once.";
  if (message.includes("not found")) return "Cup not found.";
  return "Couldn't record those invitations.";
}

function inviteResponseError(message: string) {
  if (message.includes("final field")) return "The final field is already locked.";
  if (message.includes("closed")) return "Cup invitations are closed.";
  if (message.includes("not found")) return "Invitation not found.";
  if (message.includes("active")) return "Only active players can respond to invitations.";
  return "That invitation is not available.";
}

export async function sendCupInvites(_: InviteActionState | undefined, formData: FormData): Promise<InviteActionState> {
  const admin = await getSessionPlayer();
  if (admin?.role !== "admin" || admin.status !== "active") return { ok: false, error: "Only active organisers can send cup invitations." };
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const ids = formData.getAll("playerIds").map(String);
  const deadline = String(formData.get("deadline") ?? "");
  const holdUntil = localDateTimeToIso(deadline, Number(formData.get("timezoneOffset")));
  if (!tournamentId || ids.length === 0 || !holdUntil) return { ok: false, error: "Choose players and a valid response deadline." };

  const db = await createClient();
  const { error: trophyError } = await db.rpc("configure_tournament_trophy_v1", { p_tournament_id: tournamentId, p_trophy_key: "claymore", p_trophy_name: "The Claymore" });
  if (trophyError) return { ok: false, error: "Couldn't configure this cup's trophy." };
  const { data, error } = await db.rpc("send_tournament_invites_v2", {
    p_tournament_id: tournamentId,
    p_player_ids: ids,
    p_hold_until: holdUntil,
  });
  if (error) return { ok: false, error: inviteSendError(error.message ?? "") };
  const current = (Array.isArray(data) ? data : []).filter((invite) => invite.status === "sent" || invite.status === "opened");
  let delivery;
  try {
    delivery = await deliverCupInviteEmails(tournamentId, current.map((invite) => ({
      playerId: invite.player_id as string,
      generation: Number(invite.generation),
    })));
  } catch (deliveryError) {
    console.error("Cup invitations committed but email reconstruction failed", { tournamentId, deliveryError });
    delivery = { delivered:0, failed:current.length };
  }
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return {
    ok: true,
    message: delivery.failed
      ? `Invitations recorded; ${delivery.failed} email${delivery.failed === 1 ? " needs" : "s need"} recovery in System health.`
      : current.length === 0
        ? "Accepted RSVPs were left unchanged."
        : `Recorded ${current.length} invitation${current.length === 1 ? "" : "s"}; email delivery is complete.`,
    deliveryWarning: delivery.failed
      ? committedEmailWarning("Invitations committed, but email delivery needs recovery.", delivery.deliveryKeys ?? [])
      : undefined,
  };
}

export async function acceptCupInvite(tournamentId: string): Promise<InviteActionState> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "Sign in to respond." };
  if (player.status !== "active") return { ok:false, error:"Only active players can respond to invitations." };
  const { data, error } = await (await createClient()).rpc("respond_to_tournament_invite_v2", { p_tournament_id: tournamentId });
  revalidatePath(`/tournaments/${tournamentId}`);
  if (error) return { ok:false, error:inviteResponseError(error.message ?? "") };
  if (data?.status === "expired") return { ok:false, error:"That invitation has expired." };
  if (data?.status !== "accepted") return { ok:false, error:"That invitation is not available." };
  return { ok: true, message: "You're in. The director will confirm the final field." };
}
