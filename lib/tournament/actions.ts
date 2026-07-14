"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { displayName } from "@/lib/auth/displayName";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import { renderResultEmail } from "./email-templates";
import { renderTournamentEmail, sendTournamentEmail, type LifecycleEmailKind, type TournamentEmailKind } from "./email";
import { createClient } from "@/lib/supabase/server";
import { deriveTournamentStandings, generateRoundRobin, planFinalStage, resolveDecider } from "./logic";
import { validateTournamentScore } from "./score";
import { MAX_TOURNAMENT_IMAGE_BYTES, TOURNAMENT_IMAGE_TYPES } from "./crop";
import type { TournamentResult, TournamentRuleset } from "./types";
import { deriveOfficialPlacements } from "./placements";
import { loadTournamentBoard } from "./read";
import { SURFACES } from "@/lib/courts/types";

export type TournamentActionState =
  | { ok: true; message: string; tournamentId?: string }
  | { ok: false; error: string };

const FORBIDDEN: TournamentActionState = { ok: false, error: "Only admins can manage tournaments." };

async function requireAdmin() {
  const player = await getSessionPlayer();
  return player?.role === "admin" ? player : null;
}

function textValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function localDateTimeToIso(value: string, offsetMinutes: number): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !Number.isFinite(offsetMinutes)) return null;
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute) + offsetMinutes * 60_000;
  return new Date(utc).toISOString();
}

function invalidateTournament(tournamentId: string) {
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/");
}

async function sendTournamentEmails(tournamentId: string, kind: LifecycleEmailKind) {
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }] = await Promise.all([
    supabase.from("tournaments").select("id, name, starts_at, timezone, location_name, draw_locked_at").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id").eq("tournament_id", tournamentId),
  ]);
  if (!tournament) return { ok: false as const, error: "Tournament not found." };
  if (!tournament.draw_locked_at) return { ok: false as const, error: "Lock the draw before sending tournament emails." };
  const playerIds = (participants ?? []).map((participant) => participant.player_id);
  const { data: players } = playerIds.length
    ? await supabase.from("players").select("id, first_name, email, status").in("id", playerIds)
    : { data: [] };
  const recipients = (players ?? []).filter((player) => player.status === "active" && player.email);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) return { ok: false as const, error: "Tournament email is not configured." };

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const player of recipients) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_tournament_email_delivery", {
      p_tournament_id: tournamentId, p_player_id: player.id, p_kind: kind,
    });
    if (claimError) {
      console.error("Tournament email claim failed", { tournamentId, playerId: player.id, kind, claimError });
      failed++;
      continue;
    }
    if (!claimed) {
      skipped++;
      continue;
    }
    try {
      const messageId = await sendTournamentEmail(player.email, renderTournamentEmail({
        kind,
        firstName: player.first_name ?? "player",
        tournamentName: tournament.name,
        startsAt: tournament.starts_at,
        timezone: tournament.timezone,
        locationName: tournament.location_name,
        playerCount: recipients.length,
        tournamentUrl: `${siteUrl}/tournaments/${tournamentId}`,
      }), `tournament/${tournamentId}/${kind}/${player.id}`);
      await supabase.from("tournament_email_deliveries").update({
        status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString(),
      }).eq("tournament_id", tournamentId).eq("player_id", player.id).eq("kind", kind);
      sent++;
    } catch (error) {
      console.error("Tournament email delivery failed", { tournamentId, playerId: player.id, kind, error });
      await supabase.from("tournament_email_deliveries").delete()
        .eq("tournament_id", tournamentId).eq("player_id", player.id).eq("kind", kind);
      failed++;
    }
  }
  if (failed > 0) return { ok: false as const, error: `Sent ${sent}; ${failed} failed. Click again to retry unsent emails.` };
  return { ok: true as const, message: sent > 0 ? `Sent ${sent} ${kind === "locked_in" ? "locked-in" : "game-day"} emails.` : `Everyone has already received this email.`, skipped };
}

async function prepareTournamentPlacements(tournamentId: string) {
  const board = await loadTournamentBoard(tournamentId);
  if (!board || board.tournament.status !== "completed" || !board.tournament.completion_path) {
    throw new Error("Tournament placements are not final.");
  }
  const supabase = await createClient();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, fixture_id, player1_id, player2_id, winner_id, status, played_at, match_sets(match_id, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error("Couldn't load tournament results.");
  const rows = matches ?? [];
  const placements = deriveOfficialPlacements({
    completionPath: board.tournament.completion_path,
    standings: board.standings,
    fixtures: board.fixtures,
    matches: rows,
    sets: rows.flatMap((match) => match.match_sets ?? []),
  });
  const awardedAt = board.tournament.starts_at;
  const { error: placementError } = await supabase.from("tournament_placements").upsert(
    placements.map((placement) => ({
      tournament_id: tournamentId,
      player_id: placement.playerId,
      placement: placement.placement,
      points: placement.points,
      awarded_at: awardedAt,
    })),
    { onConflict: "tournament_id,player_id", ignoreDuplicates: true },
  );
  if (placementError) throw new Error("Couldn't save tournament placements.");
  return { board, placements, supabase };
}

export async function sendTournamentResultEmails(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  let prepared: Awaited<ReturnType<typeof prepareTournamentPlacements>>;
  try {
    prepared = await prepareTournamentPlacements(tournamentId);
    await rebuildRatingCache();
  } catch (error) {
    console.error("Tournament placement preparation failed", { tournamentId, error });
    return { ok: false, error: "Final placements are not ready to send." };
  }
  const { board, placements, supabase } = prepared;
  const playerIds = placements.map((placement) => placement.playerId);
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, email, nickname, use_nickname, status")
    .in("id", playerIds);
  const playerById = new Map((players ?? []).map((player) => [player.id, player]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) return { ok: false, error: "Tournament email is not configured." };
  let sent = 0;
  let failed = 0;
  for (const placement of placements) {
    const player = playerById.get(placement.playerId);
    if (!player?.email || player.status !== "active") continue;
    const kind = `result_${["1st", "2nd", "3rd", "4th"][placement.placement - 1]}` as TournamentEmailKind;
    const { data: claimed, error: claimError } = await supabase.rpc("claim_tournament_email_delivery", {
      p_tournament_id: tournamentId, p_player_id: player.id, p_kind: kind,
    });
    if (claimError || !claimed) {
      if (claimError) failed++;
      continue;
    }
    try {
      const email = renderResultEmail({
        firstName: player.first_name ?? "player",
        tournamentName: board.tournament.name,
        startsAt: board.tournament.starts_at,
        timezone: board.tournament.timezone,
        locationName: board.tournament.location_name,
        playerCount: placements.length,
        tournamentUrl: `${siteUrl}/tournaments/${tournamentId}`,
        assetBaseUrl: `${siteUrl}/emails`,
        placement: placement.placement,
        points: placement.points,
        matches: placement.matches.map((match) => {
          const opponent = playerById.get(match.opponentId);
          return {
            opponentName: opponent ? displayName({ firstName: opponent.first_name, lastName: opponent.last_name, email: opponent.email, nickname: opponent.nickname, useNickname: opponent.use_nickname }) : "Opponent",
            score: match.score,
            won: match.won,
          };
        }),
      });
      const messageId = await sendTournamentEmail(player.email, email, `tournament/${tournamentId}/${kind}/${player.id}`);
      await supabase.from("tournament_email_deliveries").update({ status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString() })
        .eq("tournament_id", tournamentId).eq("player_id", player.id).eq("kind", kind);
      sent++;
    } catch (error) {
      console.error("Tournament result email failed", { tournamentId, playerId: player.id, error });
      await supabase.from("tournament_email_deliveries").delete()
        .eq("tournament_id", tournamentId).eq("player_id", player.id).eq("kind", kind);
      failed++;
    }
  }
  invalidateTournament(tournamentId);
  return failed > 0
    ? { ok: false, error: `Sent ${sent}; ${failed} failed. Click again to retry unsent emails.` }
    : { ok: true, message: sent > 0 ? `Sent ${sent} tournament result emails.` : "Everyone has already received their result email." };
}

export async function lockTournamentDraw(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lock_tournament_draw", { p_tournament_id: tournamentId });
  if (error) return { ok: false, error: "Couldn't lock the draw. Generate and review it first." };
  invalidateTournament(tournamentId);
  const delivery = await sendTournamentEmails(tournamentId, "locked_in");
  if (!delivery.ok) return { ok: false, error: `Draw locked. ${delivery.error}` };
  return { ok: true, message: `Draw locked. ${delivery.message}` };
}

export async function sendLockedInEmail(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  return sendTournamentEmails(textValue(formData, "tournamentId"), "locked_in");
}

export async function sendGameDayEmail(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  return sendTournamentEmails(textValue(formData, "tournamentId"), "game_day");
}

function tournamentImagePath(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/tournament-images/";
  const path = url.split(marker)[1]?.split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

type TournamentSetup = {
  id: string;
  courts: number;
  group_ruleset: TournamentRuleset;
  status: string;
};

type TournamentParticipantRow = { player_id: string; seed: number };

async function writeRoundRobinFixtures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournament: TournamentSetup,
  tournamentId: string,
  participants: TournamentParticipantRow[],
) {
  const rounds = generateRoundRobin(participants.map((row) => row.player_id), tournament.courts);
  return supabase.from("fixtures").insert(
    rounds.flatMap((round) => round.fixtures.map((fixture) => ({
      tournament_id: tournamentId,
      stage: "group",
      round_number: fixture.roundNumber,
      slot_number: fixture.slotNumber,
      court_number: fixture.courtNumber,
      ruleset: tournament.group_ruleset,
      player1_id: fixture.player1Id,
      player2_id: fixture.player2Id,
    }))),
  );
}

export async function createTournament(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  const admin = await requireAdmin();
  if (!admin) return FORBIDDEN;

  const name = textValue(formData, "name");
  const locationName = textValue(formData, "locationName");
  const defaultSurface = textValue(formData, "defaultSurface");
  const courts = Number(textValue(formData, "courts"));
  const startsAt = localDateTimeToIso(
    textValue(formData, "startsAtLocal"),
    Number(textValue(formData, "timezoneOffset")),
  );
  const participantIds = formData.getAll("participantIds").map(String);

  if (!name || !locationName || !startsAt) return { ok: false, error: "Complete the event name, time, and venue." };
  if (defaultSurface && !SURFACES.includes(defaultSurface as (typeof SURFACES)[number])) return { ok: false, error: "Choose a valid default surface." };
  if (!Number.isInteger(courts) || courts < 1) return { ok: false, error: "Enter at least one court." };
  if (participantIds.length !== 4 || new Set(participantIds).size !== 4) {
    return { ok: false, error: "This release requires exactly four unique players." };
  }

  const supabase = await createClient();
  const { data: courtId, error: courtError } = await supabase.rpc("resolve_court", { p_name: locationName });
  if (courtError || !courtId) return { ok: false, error: "Couldn't save that court." };
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .insert({
      name,
      location_name: locationName,
      court_id: courtId,
      default_surface: defaultSurface || null,
      starts_at: startsAt,
      timezone: "Australia/Melbourne",
      courts,
      structure: "round_robin",
      status: "draft",
      counts_as: "ranked",
      group_ruleset: "short_first_to_3",
      playoff_ruleset: "standard_set_tiebreak_6_all",
      rules_note: "After group play, the director may make the standings final or continue to a final and third-place match. A tie across second and third uses a first-to-3 decider.",
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error || !tournament) return { ok: false, error: "Couldn't create the tournament." };

  const { error: participantError } = await supabase.from("tournament_participants").insert(
    participantIds.map((playerId, index) => ({ tournament_id: tournament.id, player_id: playerId, seed: index + 1 })),
  );
  if (participantError) {
    await supabase.from("tournaments").delete().eq("id", tournament.id);
    return { ok: false, error: "Couldn't add the tournament players." };
  }

  revalidatePath("/tournaments");
  return { ok: true, message: "Tournament created. Review and generate the draw.", tournamentId: tournament.id };
}

export async function updateTournamentPhoto(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;

  const tournamentId = textValue(formData, "tournamentId");
  const removePhoto = formData.get("removePhoto") === "true";
  const photo = formData.get("photo");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  if (!(photo instanceof File) && !removePhoto) return { ok: false, error: "Choose a photo first." };
  if (photo instanceof File && photo.size > 0) {
    if (!TOURNAMENT_IMAGE_TYPES.includes(photo.type as (typeof TOURNAMENT_IMAGE_TYPES)[number])) {
      return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
    }
    if (photo.size > MAX_TOURNAMENT_IMAGE_BYTES) {
      return { ok: false, error: "That photo is too large. Choose one under 5 MB." };
    }
  }

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, cover_image_url")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const storage = supabase.storage.from("tournament-images");
  let nextUrl = tournament.cover_image_url as string | null;
  let uploadedPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    uploadedPath = `${tournamentId}/${Date.now()}-cover.${extension}`;
    const { error: uploadError } = await storage.upload(uploadedPath, photo, {
      contentType: photo.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) return { ok: false, error: "Couldn't upload that photo. Please try again." };
    nextUrl = `${storage.getPublicUrl(uploadedPath).data.publicUrl}?v=${Date.now()}`;
  } else if (removePhoto) {
    nextUrl = null;
  }

  const { error: updateError } = await supabase
    .from("tournaments")
    .update({ cover_image_url: nextUrl })
    .eq("id", tournamentId);
  if (updateError) {
    if (uploadedPath) await storage.remove([uploadedPath]);
    return { ok: false, error: "Couldn't save the tournament photo." };
  }

  const previousPath = tournamentImagePath(tournament.cover_image_url);
  if (previousPath && (uploadedPath || removePhoto)) await storage.remove([previousPath]);
  invalidateTournament(tournamentId);
  return { ok: true, message: removePhoto ? "Tournament photo removed." : "Tournament photo saved." };
}

export async function generateTournamentFixtures(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }, { data: matches }] = await Promise.all([
    supabase.from("tournaments").select("id, courts, group_ruleset, status, draw_locked_at").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("matches").select("id").eq("tournament_id", tournamentId).limit(1),
  ]);

  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.draw_locked_at) return { ok: false, error: "The draw has been locked in." };
  if ((matches ?? []).length > 0 || tournament.status === "live" || tournament.status === "completed") {
    return { ok: false, error: "The draw is locked after the first result." };
  }
  if ((participants ?? []).length !== 4) return { ok: false, error: "The draw needs exactly four players." };

  const { error: deleteError } = await supabase.from("fixtures").delete().eq("tournament_id", tournamentId);
  if (deleteError) return { ok: false, error: "Couldn't clear the existing draw." };
  const { error } = await writeRoundRobinFixtures(supabase, tournament, tournamentId, participants ?? []);
  if (error) return { ok: false, error: "Couldn't generate the draw." };

  await supabase.from("tournaments").update({ status: "scheduled" }).eq("id", tournamentId);
  invalidateTournament(tournamentId);
  return { ok: true, message: "Draw generated and tournament scheduled." };
}

export async function replaceTournamentParticipant(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;

  const tournamentId = textValue(formData, "tournamentId");
  const outgoingPlayerId = textValue(formData, "outgoingPlayerId");
  const replacementPlayerId = textValue(formData, "replacementPlayerId");
  if (!tournamentId || !outgoingPlayerId || !replacementPlayerId) {
    return { ok: false, error: "Choose the player leaving and their replacement." };
  }
  if (outgoingPlayerId === replacementPlayerId) {
    return { ok: false, error: "Choose a different replacement player." };
  }

  const supabase = await createClient();
  const [
    { data: tournament },
    { data: participants },
    { data: matches },
    { data: fixtures },
    { data: replacement },
  ] = await Promise.all([
    supabase.from("tournaments").select("id, courts, group_ruleset, status, draw_locked_at").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("matches").select("id").eq("tournament_id", tournamentId).limit(1),
    supabase.from("fixtures").select("id").eq("tournament_id", tournamentId).limit(1),
    supabase.from("players").select("id, status").eq("id", replacementPlayerId).single(),
  ]);

  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.draw_locked_at) return { ok: false, error: "The draw has been locked in." };
  if (!(tournament.status === "draft" || tournament.status === "scheduled")) {
    return { ok: false, error: "The field is locked once tournament play has started." };
  }
  if ((matches ?? []).length > 0) {
    return { ok: false, error: "The field is locked after the first result." };
  }
  const currentParticipants = (participants ?? []) as TournamentParticipantRow[];
  const outgoing = currentParticipants.find((participant) => participant.player_id === outgoingPlayerId);
  if (!outgoing) return { ok: false, error: "That player is not in this tournament." };
  if (currentParticipants.some((participant) => participant.player_id === replacementPlayerId)) {
    return { ok: false, error: "That player is already in this tournament." };
  }
  if (!replacement || replacement.status !== "active") {
    return { ok: false, error: "Choose an active player as the replacement." };
  }
  if (currentParticipants.length !== 4) {
    return { ok: false, error: "This release requires exactly four tournament players." };
  }

  const hadFixtures = (fixtures ?? []).length > 0;
  const { error: deleteError } = await supabase.from("fixtures").delete().eq("tournament_id", tournamentId);
  if (deleteError) return { ok: false, error: "Couldn't clear the existing draw." };

  const { error: participantError } = await supabase
    .from("tournament_participants")
    .update({ player_id: replacementPlayerId })
    .eq("tournament_id", tournamentId)
    .eq("player_id", outgoingPlayerId);
  if (participantError) return { ok: false, error: "Couldn't replace that tournament player." };

  const updatedParticipants = currentParticipants.map((participant) =>
    participant.player_id === outgoingPlayerId
      ? { ...participant, player_id: replacementPlayerId }
      : participant,
  );
  const { error: fixtureError } = await writeRoundRobinFixtures(
    supabase,
    tournament as TournamentSetup,
    tournamentId,
    updatedParticipants,
  );
  if (fixtureError) {
    await supabase.from("fixtures").delete().eq("tournament_id", tournamentId);
    await supabase
      .from("tournament_participants")
      .update({ player_id: outgoingPlayerId })
      .eq("tournament_id", tournamentId)
      .eq("player_id", replacementPlayerId);
    return { ok: false, error: "Couldn't regenerate the draw, so the original field was restored." };
  }

  if (hadFixtures) {
    await supabase.from("tournaments").update({ status: "scheduled" }).eq("id", tournamentId);
  }
  invalidateTournament(tournamentId);
  return { ok: true, message: "Player replaced and the draw was regenerated." };
}

export async function recordTournamentResult(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const fixtureId = textValue(formData, "fixtureId");
  const p1Games = Number(textValue(formData, "p1Games"));
  const p2Games = Number(textValue(formData, "p2Games"));
  const tb1Raw = textValue(formData, "tiebreakP1");
  const tb2Raw = textValue(formData, "tiebreakP2");
  const tiebreakP1 = tb1Raw === "" ? null : Number(tb1Raw);
  const tiebreakP2 = tb2Raw === "" ? null : Number(tb2Raw);

  const supabase = await createClient();
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, tournament_id, player1_id, player2_id, ruleset, skipped_at")
    .eq("id", fixtureId)
    .single();
  if (!fixture) return { ok: false, error: "Fixture not found." };
  if (fixture.skipped_at) return { ok: false, error: "That fixture was skipped when the tournament completed." };

  const validated = validateTournamentScore(fixture.ruleset as TournamentRuleset, fixture.player1_id, fixture.player2_id, {
    p1Games, p2Games, tiebreakP1, tiebreakP2,
  });
  if (!validated.ok) return validated;

  const { data: recordedMatchId, error } = await supabase.rpc("record_tournament_result", {
    p_fixture_id: fixture.id,
    p_winner_id: validated.winnerId,
    p_sets: [{ p1_games: p1Games, p2_games: p2Games, tiebreak_p1: tiebreakP1, tiebreak_p2: tiebreakP2 }],
    p_played_at: new Date().toISOString(),
    p_duration_minutes: null,
  });
  if (error) return { ok: false, error: "Couldn't record this result. It may already be complete." };
  try {
    await rebuildRatingCache();
  } catch (cacheError) {
    console.error("Committed tournament result needs a derived-cache rebuild", { entityId:recordedMatchId, operation:"record_tournament_result", recovery:"Run the organiser rating rebuild.", error:cacheError });
    invalidateTournament(fixture.tournament_id);
    return { ok: true, message: "Result recorded. The points cache needs the organiser recovery rebuild." };
  }

  invalidateTournament(fixture.tournament_id);
  revalidatePath("/players/[playerId]", "page");
  return { ok: true, message: "Result approved and Elo rebuilt." };
}

async function loadTournamentResults(tournamentId: string) {
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }, { data: fixtures }, { data: matches }] = await Promise.all([
    supabase.from("tournaments").select("id, status, playoff_ruleset").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("fixtures").select("id, stage, round_number, player1_id, player2_id").eq("tournament_id", tournamentId),
    supabase.from("matches").select("id, fixture_id, player1_id, player2_id, winner_id, status").eq("tournament_id", tournamentId),
  ]);
  const approved = (matches ?? []).filter((match) => match.status === "approved");
  const matchIds = approved.map((match) => match.id);
  const { data: sets } = matchIds.length
    ? await supabase.from("match_sets").select("match_id, p1_games, p2_games").in("match_id", matchIds)
    : { data: [] as Array<{ match_id: string; p1_games: number; p2_games: number }> };
  const scoreByMatch = new Map((sets ?? []).map((set) => [set.match_id, set]));
  const resultByFixture = new Map(approved.map((match) => [match.fixture_id, match]));
  const results: TournamentResult[] = (fixtures ?? []).flatMap((fixture) => {
    const match = resultByFixture.get(fixture.id);
    const score = match ? scoreByMatch.get(match.id) : null;
    return match && score && match.winner_id ? [{
      fixtureId: fixture.id,
      player1Id: match.player1_id,
      player2Id: match.player2_id,
      winnerId: match.winner_id,
      player1Games: score.p1_games,
      player2Games: score.p2_games,
    }] : [];
  });
  return { supabase, tournament, participants: participants ?? [], fixtures: fixtures ?? [], resultByFixture, results };
}

export async function advanceTournament(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  const state = await loadTournamentResults(tournamentId);
  if (!state.tournament) return { ok: false, error: "Tournament not found." };

  const groupFixtures = state.fixtures.filter((fixture) => fixture.stage === "group");
  const groupResults = state.results.filter((result) => groupFixtures.some((fixture) => fixture.id === result.fixtureId));
  if (groupFixtures.length === 0 || groupResults.length !== groupFixtures.length) {
    return { ok: false, error: "Complete every round-robin fixture first." };
  }

  const standings = deriveTournamentStandings(
    state.participants.map((row) => ({ playerId: row.player_id, seed: row.seed })),
    groupResults,
  );
  const basePlan = planFinalStage(standings);
  const deciderFixture = state.fixtures.find((fixture) => fixture.stage === "tiebreak");
  const finalFixtures = state.fixtures.filter((fixture) => fixture.stage === "final" || fixture.stage === "playoff");

  if (finalFixtures.length > 0) {
    if (finalFixtures.every((fixture) => state.resultByFixture.has(fixture.id))) {
      const { error } = await state.supabase
        .from("tournaments")
        .update({ status: "completed", completion_path: "final_stage" })
        .eq("id", tournamentId);
      if (error) return { ok: false, error: "Couldn't complete the tournament." };
      try {
        await prepareTournamentPlacements(tournamentId);
        await rebuildRatingCache();
      } catch {
        invalidateTournament(tournamentId);
        return { ok: false, error: "Tournament completed, but placement points need rebuilding before result emails can send." };
      }
      invalidateTournament(tournamentId);
      return { ok: true, message: "Tournament complete. The champion is official." };
    }
    return { ok: false, error: "Complete the final and third-place match first." };
  }

  const maxGroupRound = Math.max(...groupFixtures.map((fixture) => fixture.round_number));
  if (basePlan.kind === "decider" && !deciderFixture) {
    const { error } = await state.supabase.from("fixtures").insert({
      tournament_id: tournamentId,
      stage: "tiebreak",
      round_number: maxGroupRound + 1,
      slot_number: 1,
      court_number: 1,
      ruleset: "short_first_to_3",
      player1_id: basePlan.decider[0],
      player2_id: basePlan.decider[1],
    });
    if (error) return { ok: false, error: "Couldn't create the qualification decider." };
    invalidateTournament(tournamentId);
    return { ok: true, message: "Qualification is tied. The decider is ready on Court 1." };
  }

  let finalsPlan = basePlan.kind === "finals" ? basePlan : null;
  let finalsRound = maxGroupRound + 1;
  if (basePlan.kind === "decider") {
    const deciderResult = deciderFixture ? state.resultByFixture.get(deciderFixture.id) : null;
    if (!deciderResult?.winner_id) return { ok: false, error: "Complete the qualification decider first." };
    finalsPlan = resolveDecider(basePlan, deciderResult.winner_id);
    finalsRound++;
  }

  const { error } = await state.supabase.from("fixtures").insert([
    {
      tournament_id: tournamentId, stage: "final", round_number: finalsRound, slot_number: 1, court_number: 1,
      ruleset: state.tournament.playoff_ruleset, player1_id: finalsPlan!.final[0], player2_id: finalsPlan!.final[1],
    },
    {
      tournament_id: tournamentId, stage: "playoff", round_number: finalsRound, slot_number: 1, court_number: 2,
      ruleset: state.tournament.playoff_ruleset, player1_id: finalsPlan!.playoff[0], player2_id: finalsPlan!.playoff[1],
    },
  ]);
  if (error) return { ok: false, error: "Couldn't create the final stage." };
  invalidateTournament(tournamentId);
  return { ok: true, message: "The final and third-place match are ready." };
}

export async function completeTournamentFromStandings(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_tournament_from_standings", {
    p_tournament_id: tournamentId,
  });
  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("round-robin")) return { ok: false, error: "Complete every round-robin fixture first." };
    if (message.includes("qualification decider")) return { ok: false, error: "Complete the qualification decider first." };
    if (message.includes("final stage")) return { ok: false, error: "The final stage has started, so standings can no longer end the tournament." };
    return { ok: false, error: "Couldn't complete the tournament from standings." };
  }
  try {
    await prepareTournamentPlacements(tournamentId);
    await rebuildRatingCache();
  } catch {
    invalidateTournament(tournamentId);
    return { ok: false, error: "Tournament completed, but placement points need rebuilding before result emails can send." };
  }
  invalidateTournament(tournamentId);
  return { ok: true, message: "Tournament complete. The round-robin standings are final." };
}
