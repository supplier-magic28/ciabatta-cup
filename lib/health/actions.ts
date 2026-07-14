"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/auth/displayName";
import { formatScore } from "@/lib/match/score";
import { renderRankedMatchLoggedEmail } from "@/lib/match/submission-email";
import { renderExternalMatchEmail } from "@/lib/match/external-email";
import { renderPracticeEmail } from "@/lib/practice/email";
import { sendPlannedLifecycleEmail } from "@/lib/planned/delivery";
import { sendTournamentEmail } from "@/lib/tournament/email";
import { isRetryableDeliveryKind } from "./types";

type RetryResult = { ok: true } | { ok: false; error: string };

type DeliveryRow = {
  idempotency_key: string;
  kind: string;
  player_id: string | null;
  entity_type: string;
  entity_id: string | null;
  status: "pending" | "sent" | "failed";
  updated_at: string;
};

type MatchRow = {
  id: string;
  type: "ranked" | "exhibition" | "unranked_external";
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  submitted_by: string;
  external_won: boolean;
  played_at: string;
  planned_match_id: string | null;
  match_sets: Array<{
    set_number: number;
    p1_games: number;
    p2_games: number;
    tiebreak_p1: number | null;
    tiebreak_p2: number | null;
  }>;
};

function playerLabel(player: { first_name: string | null; last_name: string | null; email: string; nickname: string | null; use_nickname: boolean }) {
  return displayName({
    firstName: player.first_name,
    lastName: player.last_name,
    email: player.email,
    nickname: player.nickname,
    useNickname: player.use_nickname,
  });
}

export async function refreshBackendHealth(): Promise<RetryResult> {
  const organiser = await getSessionPlayer();
  if (!organiser || organiser.role !== "admin") return { ok: false, error: "Only organisers can inspect backend health." };
  revalidatePath("/admin/health");
  return { ok: true };
}

async function retryMatchDelivery(delivery: DeliveryRow) {
  if (!delivery.entity_id || !delivery.player_id) throw new Error("Delivery is missing its match or recipient.");
  const admin = createAdminClient();
  const { data } = await admin
    .from("matches")
    .select("id,type,player1_id,player2_id,winner_id,submitted_by,external_won,played_at,planned_match_id,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)")
    .eq("id", delivery.entity_id)
    .single();
  const match = data as MatchRow | null;
  if (!match) throw new Error("Match fact is no longer available.");

  const participantIds = [match.player1_id, match.player2_id].filter((id): id is string => Boolean(id));
  const { data: people } = await admin
    .from("players")
    .select("id,email,first_name,last_name,nickname,use_nickname")
    .in("id", participantIds);
  const recipient = (people ?? []).find((person) => person.id === delivery.player_id);
  if (!recipient) throw new Error("Email recipient is no longer available.");
  const sets = [...(match.match_sets ?? [])].sort((left, right) => left.set_number - right.set_number);
  const score = formatScore(sets.map((set) => ({
    p1Games: set.p1_games,
    p2Games: set.p2_games,
    tiebreakP1: set.tiebreak_p1,
    tiebreakP2: set.tiebreak_p2,
  })));

  if (delivery.kind === "ranked_match_logged") {
    if (match.type !== "ranked" || !match.player2_id || !match.winner_id) throw new Error("Ranked match facts are incomplete.");
    const winner = (people ?? []).find((person) => person.id === match.winner_id);
    const loser = (people ?? []).find((person) => person.id !== match.winner_id);
    if (!winner || !loser) throw new Error("Match participants are no longer available.");
    await sendTournamentEmail(
      recipient.email,
      renderRankedMatchLoggedEmail({
        firstName: recipient.first_name ?? "Player",
        winnerName: playerLabel(winner),
        loserName: playerLabel(loser),
        score,
        matchDate: match.played_at.slice(0, 10),
        confirmUrl: recipient.id === match.submitted_by
          ? undefined
          : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/matches`,
      }),
      delivery.idempotency_key,
      { kind: delivery.kind, playerId: recipient.id, entityType: "match", entityId: match.id },
    );
    return;
  }

  if (delivery.kind === "external_match_logged") {
    if (match.type !== "unranked_external") throw new Error("External match facts are incomplete.");
    const { data: detail } = await admin
      .from("external_match_details")
      .select("opponent_name")
      .eq("match_id", match.id)
      .single();
    if (!detail) throw new Error("External opponent detail is no longer available.");
    await sendTournamentEmail(
      recipient.email,
      renderExternalMatchEmail({
        firstName: recipient.first_name ?? "Player",
        opponentName: detail.opponent_name,
        score,
        won: !match.external_won,
      }),
      delivery.idempotency_key,
      { kind: delivery.kind, playerId: recipient.id, entityType: "match", entityId: match.id },
    );
    return;
  }
  throw new Error("This match email kind cannot be reconstructed.");
}

async function retryPracticeDelivery(delivery: DeliveryRow) {
  if (!delivery.entity_id || !delivery.player_id) throw new Error("Delivery is missing its practice or recipient.");
  const admin = createAdminClient();
  const [{ data: practice }, { data: player }] = await Promise.all([
    admin.from("practice_sessions").select("id,player_id,activity,minutes,practiced_on").eq("id", delivery.entity_id).single(),
    admin.from("players").select("id,email,first_name").eq("id", delivery.player_id).single(),
  ]);
  if (!practice || !player || practice.player_id !== player.id) throw new Error("Practice delivery facts are no longer available.");
  const kind = delivery.kind.replace("practice_", "");
  if (kind !== "logged" && kind !== "approved" && kind !== "rejected") throw new Error("This practice email kind cannot be reconstructed.");
  await sendTournamentEmail(
    player.email,
    renderPracticeEmail({
      kind,
      firstName: player.first_name ?? "Player",
      activity: practice.activity,
      minutes: practice.minutes,
      practiceDate: practice.practiced_on,
    }),
    delivery.idempotency_key,
    { kind: delivery.kind, playerId: player.id, entityType: "practice", entityId: practice.id },
  );
}

export async function retryLifecycleDelivery(idempotencyKey: string): Promise<RetryResult> {
  const organiser = await getSessionPlayer();
  if (!organiser || organiser.role !== "admin") return { ok: false, error: "Only organisers can retry deliveries." };
  if (!idempotencyKey || idempotencyKey.length > 300) return { ok: false, error: "Delivery not found." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("lifecycle_email_deliveries")
    .select("idempotency_key,kind,player_id,entity_type,entity_id,status,updated_at")
    .eq("idempotency_key", idempotencyKey)
    .single();
  const delivery = data as DeliveryRow | null;
  if (!delivery) return { ok: false, error: "Delivery not found." };
  const stale = delivery.status === "pending"
    && Date.now() - new Date(delivery.updated_at).getTime() >= 15 * 60 * 1000;
  if (delivery.status !== "failed" && !stale) return { ok: false, error: "This delivery is not ready to retry." };
  if (!isRetryableDeliveryKind(delivery.kind)) return { ok: false, error: "This delivery needs manual recovery." };

  try {
    if (delivery.kind.startsWith("planned_")) {
      if (!delivery.entity_id || !delivery.player_id) throw new Error("Planned delivery facts are incomplete.");
      const kind = delivery.kind === "planned_locked" ? "locked" : "confirmed";
      const expectedKey = `planned/${delivery.entity_id}/${kind}/${delivery.player_id}`;
      if (delivery.idempotency_key !== expectedKey) {
        throw new Error("Planned delivery key does not match its canonical facts.");
      }
      let matchId: string | undefined;
      if (kind === "confirmed") {
        const { data: match } = await admin.from("matches").select("id").eq("planned_match_id", delivery.entity_id).single();
        if (!match) throw new Error("Confirmed planned match fact is unavailable.");
        matchId = match.id;
      }
      await sendPlannedLifecycleEmail(delivery.entity_id, kind, matchId, delivery.player_id);
    } else if (delivery.kind.startsWith("practice_")) {
      await retryPracticeDelivery(delivery);
    } else {
      await retryMatchDelivery(delivery);
    }
  } catch (error) {
    console.error("Lifecycle email retry failed", {
      idempotencyKey,
      recovery: "Inspect the organiser health page and canonical entity facts.",
      error,
    });
    revalidatePath("/admin/health");
    return { ok: false, error: error instanceof Error ? error.message : "Email retry failed." };
  }

  revalidatePath("/admin/health");
  return { ok: true };
}
