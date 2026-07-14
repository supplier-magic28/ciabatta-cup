import "server-only";

import { renderGameDayEmail, renderLockedInEmail, type RenderedEmail } from "./email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export type TournamentEmailKind = "locked_in" | "game_day" | "result_1st" | "result_2nd" | "result_3rd" | "result_4th";
export type LifecycleEmailKind = Extract<TournamentEmailKind, "locked_in" | "game_day">;

type TournamentEmail = {
  kind: LifecycleEmailKind;
  firstName: string;
  tournamentName: string;
  startsAt: string;
  timezone: string;
  locationName: string;
  playerCount: number;
  tournamentUrl: string;
};

export function renderTournamentEmail(input: TournamentEmail): RenderedEmail {
  const params = {
    firstName: input.firstName,
    tournamentName: input.tournamentName,
    startsAt: input.startsAt,
    timezone: input.timezone,
    locationName: input.locationName,
    playerCount: input.playerCount,
    tournamentUrl: input.tournamentUrl,
    assetBaseUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/emails`,
  };
  return input.kind === "locked_in"
    ? renderLockedInEmail(params)
    : renderGameDayEmail(params);
}

export type LifecycleDeliveryContext = {
  kind: string;
  playerId?: string;
  entityType: string;
  entityId?: string;
};

export async function sendTournamentEmail(to: string, email: RenderedEmail, idempotencyKey: string, delivery?: LifecycleDeliveryContext) {
  const ledger = delivery ? createAdminClient() : null;
  if (ledger && delivery) {
    const { data: existing } = await ledger.from("lifecycle_email_deliveries").select("status,attempt_count,provider_message_id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing?.status === "sent" && existing.provider_message_id) return existing.provider_message_id;
    const { error } = await ledger.from("lifecycle_email_deliveries").upsert({
      idempotency_key:idempotencyKey, kind:delivery.kind, player_id:delivery.playerId??null,
      entity_type:delivery.entityType, entity_id:delivery.entityId??null, status:"pending",
      attempt_count:(existing?.attempt_count??0)+1, provider_message_id:null, last_error:null,
      updated_at:new Date().toISOString(),
    });
    if (error) console.error("Could not persist pending lifecycle email delivery", { idempotencyKey, error });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TOURNAMENT_EMAIL_FROM;
  try {
    if (!apiKey || !from) throw new Error("Tournament email is not configured.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Email provider did not return a message id.");
    if (ledger) await ledger.from("lifecycle_email_deliveries").update({ status:"sent",provider_message_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null }).eq("idempotency_key",idempotencyKey);
    return result.id;
  } catch (error) {
    if (ledger) await ledger.from("lifecycle_email_deliveries").update({ status:"failed",last_error:error instanceof Error?error.message.slice(0,500):"Unknown delivery failure",updated_at:new Date().toISOString() }).eq("idempotency_key",idempotencyKey);
    throw error;
  }
}
