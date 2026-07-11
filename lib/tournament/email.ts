import "server-only";

import { renderGameDayEmail, renderLockedInEmail, type RenderedEmail } from "./email-templates";

export type TournamentEmailKind = "locked_in" | "game_day";

type TournamentEmail = {
  kind: TournamentEmailKind;
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

export async function sendTournamentEmail(to: string, email: ReturnType<typeof renderTournamentEmail>, idempotencyKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TOURNAMENT_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Tournament email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Email provider did not return a message id.");
  return result.id;
}
