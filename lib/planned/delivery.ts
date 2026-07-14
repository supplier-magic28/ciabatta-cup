import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatScore } from "@/lib/match/score";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { matchLockedInEmail, resultConfirmedEmail } from "./email";
import {
  formatPlannedDateTime,
  formatPlayedDate,
  matchTypeLabel,
  resolveResultNames,
  type PlannedMatchFormat,
} from "./email-data";

/** Rebuild and send one or all planned-match lifecycle emails from facts. */
export async function sendPlannedLifecycleEmail(
  plannedMatchId: string,
  kind: "locked" | "confirmed",
  matchId?: string,
  targetPlayerId?: string,
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) throw new Error("Planned-match email URL is not configured.");

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("planned_matches")
    .select("*, external_opponents(display_name)")
    .eq("id", plannedMatchId)
    .single();
  if (!plan) throw new Error("Planned match not found.");

  const ids = [plan.created_by, plan.opponent_player_id].filter(
    (id): id is string => Boolean(id),
  );
  const { data: people } = await admin
    .from("players")
    .select("id,email,first_name")
    .in("id", ids);
  const allRecipients = people ?? [];
  const recipients = targetPlayerId
    ? allRecipients.filter((person) => person.id === targetPlayerId)
    : allRecipients;
  if (targetPlayerId && recipients.length !== 1) {
    throw new Error("Lifecycle email recipient is no longer available.");
  }

  const relation = plan.external_opponents as
    | { display_name: string }
    | Array<{ display_name: string }>
    | null;
  const externalName = Array.isArray(relation)
    ? relation[0]?.display_name ?? null
    : relation?.display_name ?? null;
  const assetBaseUrl = `${siteUrl}/emails`;

  type LifecycleMatch = {
    winner_id: string | null;
    type: "ranked" | "exhibition" | "unranked_external";
    format: PlannedMatchFormat;
    format_note: string | null;
    external_won: boolean;
    player1_id: string;
    player2_id: string | null;
    played_at: string;
    match_sets: Array<{
      set_number: number;
      p1_games: number;
      p2_games: number;
      tiebreak_p1: number | null;
      tiebreak_p2: number | null;
    }>;
  };
  let match: LifecycleMatch | null = null;
  if (matchId) {
    const { data } = await admin
      .from("matches")
      .select("winner_id,type,format,format_note,external_won,player1_id,player2_id,played_at,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)")
      .eq("id", matchId)
      .single();
    match = data as LifecycleMatch | null;
  }

  for (const person of recipients) {
    const other = allRecipients.find((candidate) => candidate.id !== person.id);
    const email = kind === "locked"
      ? matchLockedInEmail({
          firstName: person.first_name ?? "Player",
          opponentName: other?.first_name ?? externalName ?? "Opponent",
          matchDateTime: formatPlannedDateTime(plan.scheduled_at),
          location: plan.location.trim() || "To be decided",
          matchUrl: `${siteUrl}/matches/${plannedMatchId}`,
          assetBaseUrl,
          externalOpponent: plan.opponent_player_id === null,
        })
      : (() => {
          if (!match) throw new Error("Confirmed planned match is missing its match fact.");
          const names = resolveResultNames({
            player1Id: match.player1_id,
            player2Id: match.player2_id,
            winnerId: match.winner_id,
            externalWon: match.external_won,
            externalName,
            players: allRecipients.map((player) => ({
              id: player.id,
              firstName: player.first_name ?? "Player",
            })),
          });
          const sets = [...(match.match_sets ?? [])].sort(
            (left, right) => left.set_number - right.set_number,
          );
          return resultConfirmedEmail({
            ...names,
            score: formatScore(sets.map((set) => ({
              p1Games: set.p1_games,
              p2Games: set.p2_games,
              tiebreakP1: set.tiebreak_p1,
              tiebreakP2: set.tiebreak_p2,
            }))),
            matchTypeLabel: matchTypeLabel(match.type, match.format, match.format_note),
            matchDate: formatPlayedDate(match.played_at),
            scoringVariant: match.type === "ranked"
              ? "ranked"
              : match.type === "exhibition"
                ? "exhibition"
                : "external",
            ladderUrl: `${siteUrl}/`,
            assetBaseUrl,
          });
        })();

    await sendTournamentEmail(
      person.email,
      email,
      `planned/${plannedMatchId}/${kind}/${person.id}`,
      { kind: `planned_${kind}`, playerId: person.id, entityType: "planned_match", entityId: plannedMatchId },
    );
  }
}
