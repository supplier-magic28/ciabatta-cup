import "server-only";

import { displayName } from "@/lib/auth/displayName";
import { committedEmailWarning, type CommittedEmailWarning } from "@/lib/email/delivery";
import { formatScore } from "@/lib/match/score";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderResultEmail } from "./email-templates";
import {
  renderTournamentEmail,
  sendTournamentEmail,
  type CustomEmailKind,
  type LifecycleEmailKind,
} from "./email";

export type EmailDeliveryBatch = {
  attempted: number;
  delivered: number;
  failed: number;
  deliveryKeys: string[];
};

export { committedEmailWarning, type CommittedEmailWarning };

type TournamentRow = {
  id: string;
  name: string;
  starts_at: string;
  timezone: string;
  location_name: string;
  draw_locked_at: string | null;
};

type PlayerRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  use_nickname: boolean;
  status: string;
};

function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!value) throw new Error("Tournament email URL is not configured.");
  return value;
}

function exactRecipients(
  playerIds: string[],
  players: PlayerRow[],
  targetPlayerId?: string,
) {
  const uniqueIds = [...new Set(playerIds)];
  const byId = new Map(players.map((player) => [player.id, player]));
  const missing = uniqueIds.filter((id) => !byId.get(id)?.email);
  if (missing.length > 0) throw new Error("The complete custom email recipient set is unavailable.");
  if (targetPlayerId) {
    const target = byId.get(targetPlayerId);
    if (!uniqueIds.includes(targetPlayerId) || !target?.email) {
      throw new Error("Custom email recipient is no longer available.");
    }
    return [target];
  }
  return uniqueIds.map((id) => byId.get(id)!);
}

async function deliver(
  recipients: PlayerRow[],
  render: (player: PlayerRow) => {
    key: string;
    kind: CustomEmailKind;
    entityType: string;
    entityId: string;
    email: ReturnType<typeof renderTournamentEmail>;
  },
): Promise<EmailDeliveryBatch> {
  const result: EmailDeliveryBatch = {
    attempted: recipients.length,
    delivered: 0,
    failed: 0,
    deliveryKeys: [],
  };
  for (const player of recipients) {
    const item = render(player);
    result.deliveryKeys.push(item.key);
    try {
      await sendTournamentEmail(player.email, item.email, item.key, {
        kind: item.kind,
        playerId: player.id,
        entityType: item.entityType,
        entityId: item.entityId,
      });
      result.delivered += 1;
    } catch (error) {
      console.error("Custom tournament email delivery failed", {
        idempotencyKey: item.key,
        playerId: player.id,
        error,
      });
      result.failed += 1;
    }
  }
  return result;
}

export async function deliverTournamentLifecycleEmails(
  tournamentId: string,
  kind: LifecycleEmailKind,
  targetPlayerId?: string,
  expectedKey?: string,
): Promise<EmailDeliveryBatch> {
  const admin = createAdminClient();
  const [{ data: tournamentData }, { data: participantData }] = await Promise.all([
    admin.from("tournaments").select("id,name,starts_at,timezone,location_name,draw_locked_at").eq("id", tournamentId).single(),
    admin.from("tournament_participants").select("player_id").eq("tournament_id", tournamentId),
  ]);
  const tournament = tournamentData as TournamentRow | null;
  if (!tournament) throw new Error("Tournament not found.");
  if (!tournament.draw_locked_at) throw new Error("Lock the draw before sending tournament emails.");
  const participantIds = (participantData ?? []).map((row) => row.player_id as string);
  const { data: playerData } = participantIds.length
    ? await admin.from("players").select("id,email,first_name,last_name,nickname,use_nickname,status").in("id", participantIds)
    : { data: [] };
  const active = (playerData ?? []).filter((player) => player.status === "active") as PlayerRow[];
  const activeIds = participantIds.filter((id) => active.some((player) => player.id === id));
  const recipients = exactRecipients(activeIds, active, targetPlayerId);
  const base = siteUrl();
  const deliveryKind: CustomEmailKind = kind === "locked_in"
    ? "tournament_locked_in"
    : "tournament_game_day";
  return deliver(recipients, (player) => {
    const key = `tournament/${tournamentId}/${kind}/${player.id}`;
    if (expectedKey && expectedKey !== key) throw new Error("Tournament delivery key does not match its canonical facts.");
    return {
    key,
    kind: deliveryKind,
    entityType: "tournament",
    entityId: tournamentId,
    email: renderTournamentEmail({
      kind,
      firstName: player.first_name ?? "player",
      tournamentName: tournament.name,
      startsAt: tournament.starts_at,
      timezone: tournament.timezone,
      locationName: tournament.location_name,
      playerCount: active.length,
      tournamentUrl: `${base}/tournaments/${tournamentId}`,
    }),
  }; });
}

type PlacementRow = {
  player_id: string;
  placement: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  points: number;
};

type MatchRow = {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  status: string;
  played_at: string;
  match_sets: Array<{
    set_number: number;
    p1_games: number;
    p2_games: number;
    tiebreak_p1: number | null;
    tiebreak_p2: number | null;
  }>;
};

function ordinal(placement: PlacementRow["placement"]) {
  return `${placement}${placement === 1 ? "st" : placement === 2 ? "nd" : placement === 3 ? "rd" : "th"}` as const;
}

function recapForPlayer(match: MatchRow, playerId: string) {
  const first = match.player1_id === playerId;
  const sets = [...(match.match_sets ?? [])]
    .sort((left, right) => left.set_number - right.set_number)
    .map((set) => ({
      p1Games: first ? set.p1_games : set.p2_games,
      p2Games: first ? set.p2_games : set.p1_games,
      tiebreakP1: first ? set.tiebreak_p1 : set.tiebreak_p2,
      tiebreakP2: first ? set.tiebreak_p2 : set.tiebreak_p1,
    }));
  return {
    opponentId: first ? match.player2_id : match.player1_id,
    won: match.winner_id === playerId,
    score: formatScore(sets),
  };
}

export async function deliverTournamentResultEmails(
  tournamentId: string,
  targetPlayerId?: string,
  expectedKey?: string,
): Promise<EmailDeliveryBatch> {
  const admin = createAdminClient();
  const [
    { data: tournamentData },
    { data: placementData },
    { data: matchData },
  ] = await Promise.all([
    admin.from("tournaments").select("id,name,starts_at,timezone,location_name,draw_locked_at").eq("id", tournamentId).single(),
    admin.from("tournament_placements").select("player_id,placement,points").eq("tournament_id", tournamentId).order("placement"),
    admin.from("matches").select("id,player1_id,player2_id,winner_id,status,played_at,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)").eq("tournament_id", tournamentId).eq("status", "approved").order("played_at"),
  ]);
  const tournament = tournamentData as TournamentRow | null;
  const placements = (placementData ?? []) as PlacementRow[];
  const matches = (matchData ?? []) as MatchRow[];
  if (!tournament || placements.length < 2 || placements.length > 8) {
    throw new Error("Persisted tournament placements are incomplete.");
  }
  const placementIds = placements.map((placement) => placement.player_id);
  const { data: playerData } = await admin
    .from("players")
    .select("id,email,first_name,last_name,nickname,use_nickname,status")
    .in("id", placementIds);
  const players = (playerData ?? []) as PlayerRow[];
  const recipients = exactRecipients(placementIds, players, targetPlayerId);
  const byId = new Map(players.map((player) => [player.id, player]));
  const placementByPlayer = new Map(placements.map((placement) => [placement.player_id, placement]));
  const base = siteUrl();

  return deliver(recipients, (player) => {
    const placement = placementByPlayer.get(player.id)!;
    const suffix = ordinal(placement.placement);
    const kind = `tournament_result_${suffix}` as CustomEmailKind;
    const key = `tournament/${tournamentId}/result_${suffix}/${player.id}`;
    if (expectedKey && expectedKey !== key) throw new Error("Tournament result delivery key does not match its canonical facts.");
    return {
      key,
      kind,
      entityType: "tournament",
      entityId: tournamentId,
      email: renderResultEmail({
        firstName: player.first_name ?? "player",
        tournamentName: tournament.name,
        startsAt: tournament.starts_at,
        timezone: tournament.timezone,
        locationName: tournament.location_name,
        playerCount: placements.length,
        tournamentUrl: `${base}/tournaments/${tournamentId}`,
        assetBaseUrl: `${base}/emails`,
        placement: placement.placement,
        points: placement.points,
        matches: matches
          .filter((match) => match.player1_id === player.id || match.player2_id === player.id)
          .map((match) => {
            const recap = recapForPlayer(match, player.id);
            const opponent = byId.get(recap.opponentId);
            return {
              score: recap.score,
              won: recap.won,
              opponentName: opponent
                ? displayName({
                    firstName: opponent.first_name,
                    lastName: opponent.last_name,
                    email: opponent.email,
                    nickname: opponent.nickname,
                    useNickname: opponent.use_nickname,
                  })
                : "Opponent",
            };
          }),
      }),
    };
  });
}
