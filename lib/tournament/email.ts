import "server-only";

import { renderGameDayEmail, renderLockedInEmail, type RenderedEmail } from "./email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export type TournamentEmailKind =
  | "locked_in"
  | "game_day"
  | "result_1st"
  | "result_2nd"
  | "result_3rd"
  | "result_4th"
  | "result_5th"
  | "result_6th"
  | "result_7th"
  | "result_8th";
export type LifecycleEmailKind = Extract<TournamentEmailKind, "locked_in" | "game_day">;

export type CustomEmailKind =
  | "ranked_match_logged"
  | "external_match_logged"
  | "practice_logged"
  | "practice_approved"
  | "practice_rejected"
  | "planned_locked"
  | "planned_confirmed"
  | "tournament_locked_in"
  | "tournament_game_day"
  | "tournament_result_1st"
  | "tournament_result_2nd"
  | "tournament_result_3rd"
  | "tournament_result_4th"
  | "tournament_result_5th"
  | "tournament_result_6th"
  | "tournament_result_7th"
  | "tournament_result_8th"
  | "tournament_invite";

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
  kind: CustomEmailKind;
  playerId: string;
  entityType: string;
  entityId: string;
};

type ClaimResult = {
  claimed?: boolean;
  status?: "pending" | "processing" | "sent" | "failed" | "superseded";
  providerMessageId?: string;
};

/**
 * Deliver one reconstructable custom application email.
 *
 * Every call must identify the canonical recipient and entity. The outbox owns
 * claim/retry state; the supplied address is checked against the current player
 * fact before it can leave the application. Supabase Auth mail does not use
 * this function.
 */
export async function sendTournamentEmail(
  to: string,
  email: RenderedEmail,
  idempotencyKey: string,
  delivery: LifecycleDeliveryContext,
) {
  const ledger = createAdminClient();
  const { data: recipient, error: recipientError } = await ledger
    .from("players")
    .select("email")
    .eq("id", delivery.playerId)
    .single();
  if (recipientError || !recipient?.email) {
    throw new Error("Custom email recipient is no longer available.");
  }
  if (recipient.email.trim().toLowerCase() !== to.trim().toLowerCase()) {
    throw new Error("Custom email recipient does not match its delivery context.");
  }

  const { error: enqueueError } = await ledger.rpc("enqueue_custom_email_v1", {
    p_idempotency_key: idempotencyKey,
    p_kind: delivery.kind,
    p_player_id: delivery.playerId,
    p_entity_type: delivery.entityType,
    p_entity_id: delivery.entityId,
  });
  if (enqueueError) throw new Error("Custom email intent could not be persisted.");

  const { data: claimData, error: claimError } = await ledger.rpc("claim_custom_email_v1", {
    p_idempotency_key: idempotencyKey,
  });
  if (claimError) throw new Error("Custom email delivery could not be claimed.");
  const claim = claimData as ClaimResult | null;
  if (!claim?.claimed) {
    if (claim?.status === "sent" && claim.providerMessageId) return claim.providerMessageId;
    if (claim?.status === "superseded") throw new Error("Custom email delivery has been superseded.");
    throw new Error("Custom email delivery is already in progress.");
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
    const { error: sentError } = await ledger.rpc("mark_custom_email_sent_v1", {
      p_idempotency_key: idempotencyKey,
      p_provider_message_id: result.id,
    });
    if (sentError) throw new Error("Provider accepted the email, but its delivery receipt was not saved.");
    return result.id;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery failure";
    const { error: failedError } = await ledger.rpc("mark_custom_email_failed_v1", {
      p_idempotency_key: idempotencyKey,
      p_last_error: message,
    });
    if (failedError) console.error("Could not persist failed custom email delivery", { idempotencyKey, failedError });
    throw error;
  }
}
