"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";
import type { LifecycleEmailKind } from "./email";
import { deliverTournamentLifecycleEmails, deliverTournamentResultEmails } from "./delivery";
import { committedEmailWarning, type CommittedEmailWarning } from "@/lib/email/delivery";
import { createClient } from "@/lib/supabase/server";
import { applyBoundaryDecider, boundaryDecider, deriveTournamentStandings, generateRoundRobin, planTopFourSemifinals } from "./logic";
import { validateTournamentScore } from "./score";
import { MAX_TOURNAMENT_IMAGE_BYTES, TOURNAMENT_IMAGE_TYPES } from "./crop";
import type { TournamentResult, TournamentRuleset } from "./types";
import { deriveOfficialPlacements } from "./placements";
import { loadTournamentBoard } from "./read";
import { SURFACES } from "@/lib/courts/types";

export type TournamentActionState =
  | { ok: true; message: string; tournamentId?: string; warnings?: string[]; deliveryWarning?: CommittedEmailWarning }
  | { ok: false; error: string; deliveryWarning?: CommittedEmailWarning };

const FORBIDDEN: TournamentActionState = { ok: false, error: "Only admins can manage tournaments." };

async function requireAdmin() {
  const player = await getSessionPlayer();
  return player?.role === "admin" && player.status === "active" ? player : null;
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
  try {
    const db = await createClient();
    const { error: intentError } = await db.rpc("enqueue_tournament_lifecycle_email_batch_v1", {
      p_tournament_id: tournamentId,
      p_kind: kind,
    });
    if (intentError) throw new Error(intentError.message ?? "Tournament email intents could not be recorded.");
    const delivery = await deliverTournamentLifecycleEmails(tournamentId, kind);
    if (delivery.failed > 0) {
      const message = `The cup change committed; ${delivery.failed} email${delivery.failed === 1 ? "" : "s"} need recovery in System health.`;
      return { ok: false as const, error:message, deliveryWarning:committedEmailWarning(message,delivery.deliveryKeys) };
    }
    return {
      ok: true as const,
      message: `Delivery is complete for ${delivery.delivered} ${kind === "locked_in" ? "locked-in" : "game-day"} email${delivery.delivered === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("Tournament email reconstruction failed", { tournamentId, kind, error });
    const message=error instanceof Error ? error.message : "Tournament email delivery is unavailable.";
    return { ok: false as const, error:message, deliveryWarning:committedEmailWarning(message,[]) };
  }
}

async function loadTournamentPlacementProjection(
  tournamentId: string,
  completionPath?: "round_robin" | "final_stage",
) {
  const board = await loadTournamentBoard(tournamentId);
  const effectivePath = completionPath ?? board?.tournament.completion_path;
  if (!board || !effectivePath) {
    throw new Error("Tournament placements are not final.");
  }
  let standings = board.standings;
  if (effectivePath === "round_robin") {
    const pair = boundaryDecider(standings, "standings");
    if (pair) {
      const decider = board.fixtures.find((fixture) => fixture.stage === "tiebreak");
      const winnerId = decider ? board.matchByFixture.get(decider.id)?.winner_id ?? null : null;
      if (!winnerId) throw new Error("The championship decider is incomplete.");
      standings = applyBoundaryDecider(standings, "standings", winnerId);
    }
  }
  const supabase = await createClient();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, fixture_id, player1_id, player2_id, winner_id, status, played_at, match_sets(match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error("Couldn't load tournament results.");
  const rows = matches ?? [];
  const placements = deriveOfficialPlacements({
    completionPath: effectivePath,
    standings,
    fixtures: board.fixtures,
    matches: rows,
    sets: rows.flatMap((match) => match.match_sets ?? []),
  });
  return { board, placements, supabase };
}

async function prepareTournamentPlacements(tournamentId: string) {
  const prepared = await loadTournamentPlacementProjection(tournamentId);
  if (prepared.board.tournament.status !== "completed") {
    throw new Error("Tournament placements are not final.");
  }
  return prepared;
}

async function finalizeTournament(
  tournamentId: string,
  completionPath: "round_robin" | "final_stage",
) {
  const prepared = await loadTournamentPlacementProjection(tournamentId, completionPath);
  const { error } = await prepared.supabase.rpc("finalize_tournament_v1", {
    p_tournament_id: tournamentId,
    p_completion_path: completionPath,
    p_placements: prepared.placements.map((placement) => ({
      player_id: placement.playerId,
      placement: placement.placement,
      points: placement.points,
    })),
  });
  if (error) throw new Error(error.message ?? "Couldn't complete the tournament.");
  return prepared;
}

export async function sendTournamentResultEmails(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  try {
    await prepareTournamentPlacements(tournamentId);
    await rebuildRatingCache();
  } catch (error) {
    console.error("Tournament placement preparation failed", { tournamentId, error });
    return { ok: false, error: "Final placements are not ready to send." };
  }
  let delivery;
  try {
    delivery = await deliverTournamentResultEmails(tournamentId);
  } catch (error) {
    console.error("Tournament result email reconstruction failed", { tournamentId, error });
    return { ok: false, error: "Official placements are saved, but their emails could not be prepared." };
  }
  invalidateTournament(tournamentId);
  return delivery.failed > 0
    ? { ok: true, message: "Official placements are saved.", warnings: [`${delivery.failed} result email${delivery.failed === 1 ? "" : "s"} need recovery in System health.`], deliveryWarning:committedEmailWarning("Official placements committed, but result email delivery needs recovery.",delivery.deliveryKeys) }
    : { ok: true, message: `Delivery is complete for ${delivery.delivered} official placement email${delivery.delivered === 1 ? "" : "s"}.` };
}

export async function lockTournamentDraw(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }] = await Promise.all([
    supabase.from("tournaments").select("id,courts").eq("id",tournamentId).single(),
    supabase.from("tournament_participants").select("player_id,seed").eq("tournament_id",tournamentId).order("seed"),
  ]);
  if (!tournament || (participants ?? []).length < 2) return {ok:false,error:"Fill every roster seat before locking the draw."};
  const fixtures = generateRoundRobin((participants ?? []).map((row)=>row.player_id),tournament.courts)
    .flatMap((round)=>round.fixtures.map((fixture)=>({
      round_number:fixture.roundNumber,slot_number:fixture.slotNumber,court_number:fixture.courtNumber,
      player1_id:fixture.player1Id,player2_id:fixture.player2Id,
    })));
  const { error } = await supabase.rpc("lock_tournament_draw_v2", { p_tournament_id: tournamentId, p_group_fixtures:fixtures });
  if (error) return { ok: false, error: "Couldn't lock the draw. Generate and review it first." };
  invalidateTournament(tournamentId);
  const delivery = await sendTournamentEmails(tournamentId, "locked_in");
  if (!delivery.ok) return { ok: true, message: "Draw locked.", warnings:[delivery.error], deliveryWarning:delivery.deliveryWarning };
  return { ok: true, message: `Draw locked. ${delivery.message}` };
}

export async function unlockTournamentDraw(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  const { error } = await (await createClient()).rpc("unlock_tournament_draw_v1", {
    p_tournament_id: tournamentId,
  });
  if (error) {
    console.error("Tournament draw unlock failed", {
      tournamentId,
      code: error.code ?? "unknown",
      message: error.message ?? "unknown",
    });
    const message = error.message ?? "";
    if (error.code === "PGRST202" || (message.includes("unlock_tournament_draw_v1") && message.includes("schema cache"))) {
      return { ok: false, error: "Draw unlock is not available in this deployment." };
    }
    if (message.includes("result")) {
      return { ok: false, error: "The draw can’t be unlocked after a result has been recorded." };
    }
    if (message.includes("cup not found")) return { ok: false, error: "Tournament not found." };
    if (message.includes("only active organisers")) return FORBIDDEN;
    return { ok: false, error: "Couldn’t unlock the draw. Try again." };
  }
  invalidateTournament(tournamentId);
  return { ok: true, message: "Draw unlocked. Update the field, then lock it again before play." };
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

function roundRobinFixturePayload(
  tournament: TournamentSetup,
  participants: TournamentParticipantRow[],
) {
  const rounds = generateRoundRobin(participants.map((row) => row.player_id), tournament.courts);
  return rounds.flatMap((round) => round.fixtures.map((fixture) => ({
      stage: "group",
      round_number: fixture.roundNumber,
      slot_number: fixture.slotNumber,
      court_number: fixture.courtNumber,
      ruleset: tournament.group_ruleset,
      player1_id: fixture.player1Id,
      player2_id: fixture.player2Id,
    })));
}

export async function createTournament(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;

  const name = textValue(formData, "name");
  const locationName = textValue(formData, "locationName");
  const defaultSurface = textValue(formData, "defaultSurface");
  const courts = Number(textValue(formData, "courts"));
  const startsAt = localDateTimeToIso(
    textValue(formData, "startsAtLocal"),
    Number(textValue(formData, "timezoneOffset")),
  );
  const participantIds = formData.getAll("participantIds").map(String).filter(Boolean);
  const seatCount = Number(textValue(formData,"seatCount") || "4");

  if (!name || !locationName || !startsAt) return { ok: false, error: "Complete the event name, time, and venue." };
  if (defaultSurface && !SURFACES.includes(defaultSurface as (typeof SURFACES)[number])) return { ok: false, error: "Choose a valid default surface." };
  if (!Number.isInteger(courts) || courts < 1) return { ok: false, error: "Enter at least one court." };
  if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 8 || participantIds.length > seatCount || new Set(participantIds).size !== participantIds.length)
    return {ok:false,error:"Choose 2 to 8 seats and do not repeat players."};

  const supabase = await createClient();
  const { data: courtId, error: courtError } = await supabase.rpc("resolve_court", { p_name: locationName });
  if (courtError || !courtId) return { ok: false, error: "Couldn't save that court." };
  const {data:tournamentId,error}=await supabase.rpc("create_tournament_v2",{
    p_name:name,p_starts_at:startsAt,p_location_name:locationName,p_court_id:courtId,p_courts:courts,
    p_default_surface:defaultSurface||null,p_seat_count:seatCount,p_participant_ids:participantIds,
  });
  if(error||!tournamentId)return {ok:false,error:"Couldn't create the tournament."};

  const warnings:string[]=[];
  const photo=formData.get("photo");
  if(photo instanceof File&&photo.size>0){
    if(!TOURNAMENT_IMAGE_TYPES.includes(photo.type as (typeof TOURNAMENT_IMAGE_TYPES)[number])||photo.size>MAX_TOURNAMENT_IMAGE_BYTES){
      warnings.push("Cup created, but the photo was invalid. Add it from the director console.");
    }else{
      const extension=photo.type==="image/png"?"png":photo.type==="image/webp"?"webp":"jpg";
      const path=`${tournamentId}/${Date.now()}-source.${extension}`;
      const storage=supabase.storage.from("tournament-images");
      const {error:uploadError}=await storage.upload(path,photo,{contentType:photo.type,cacheControl:"31536000",upsert:false});
      if(uploadError) warnings.push("Cup created, but the photo upload failed. Add it from the director console.");
      else {
        const url=`${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
        const {error:photoError}=await supabase.rpc("update_tournament_cover_v1",{
          p_tournament_id:tournamentId,p_cover_image_url:url,
          p_frame_shape:textValue(formData,"coverFrameShape")||"wide",p_zoom:Number(textValue(formData,"coverZoom")||"1"),
          p_offset_x:Number(textValue(formData,"coverOffsetX")||"0"),p_offset_y:Number(textValue(formData,"coverOffsetY")||"0")});
        if(photoError) warnings.push("Cup created, but the photo crop needs to be saved again.");
      }
    }
  }

  revalidatePath("/tournaments");
  return { ok: true, message: "Cup created. Finish the lead-up checklist before locking the draw.", tournamentId, warnings:warnings.length?warnings:undefined };
}

export async function updateTournamentPhoto(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;

  const tournamentId = textValue(formData, "tournamentId");
  const removePhoto = formData.get("removePhoto") === "true";
  const frameShape=textValue(formData,"coverFrameShape")||"wide";
  const zoom=Number(textValue(formData,"coverZoom")||"1");const offsetX=Number(textValue(formData,"coverOffsetX")||"0");const offsetY=Number(textValue(formData,"coverOffsetY")||"0");
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

  const { error: updateError } = await supabase.rpc("update_tournament_cover_v1", {
    p_tournament_id:tournamentId,p_cover_image_url:nextUrl,p_frame_shape:frameShape,
    p_zoom:zoom,p_offset_x:offsetX,p_offset_y:offsetY,
  });
  if (updateError) {
    if (uploadedPath) await storage.remove([uploadedPath]);
    return { ok: false, error: "Couldn't save the tournament photo." };
  }

  const previousPath = tournamentImagePath(tournament.cover_image_url);
  if (previousPath && (uploadedPath || removePhoto)) await storage.remove([previousPath]);
  invalidateTournament(tournamentId);
  return { ok: true, message: removePhoto ? "Tournament photo removed." : "Tournament photo saved." };
}

export async function updateTournamentSchedule(_previous:TournamentActionState|undefined,formData:FormData):Promise<TournamentActionState>{
  if(!(await requireAdmin()))return FORBIDDEN;const tournamentId=textValue(formData,"tournamentId");const locationName=textValue(formData,"locationName");
  const startsAt=localDateTimeToIso(textValue(formData,"startsAtLocal"),Number(textValue(formData,"timezoneOffset")));
  const courts=Number(textValue(formData,"courts"));const surface=textValue(formData,"defaultSurface");
  if(!tournamentId||!startsAt||!locationName||!Number.isInteger(courts))return {ok:false,error:"Complete the schedule fields."};
  const supabase=await createClient();const {data:courtId,error:courtError}=await supabase.rpc("resolve_court",{p_name:locationName});
  if(courtError||!courtId)return {ok:false,error:"Couldn't save that venue."};
  const {error}=await supabase.rpc("update_tournament_schedule_v1",{p_tournament_id:tournamentId,p_starts_at:startsAt,p_location_name:locationName,p_court_id:courtId,p_courts:courts,p_default_surface:surface||null});
  if(error)return {ok:false,error:"Unlock the schedule before editing it."};invalidateTournament(tournamentId);return {ok:true,message:"Schedule updated."};
}

export async function setTournamentScheduleLock(_previous:TournamentActionState|undefined,formData:FormData):Promise<TournamentActionState>{
  if(!(await requireAdmin()))return FORBIDDEN;const tournamentId=textValue(formData,"tournamentId");const locked=textValue(formData,"locked")==="true";
  const supabase=await createClient();const {error}=await supabase.rpc("set_tournament_schedule_lock_v1",{p_tournament_id:tournamentId,p_locked:locked});
  if(error)return {ok:false,error:"The schedule can no longer be changed."};invalidateTournament(tournamentId);return {ok:true,message:locked?"Schedule locked. Competition choices are open.":"Schedule unlocked for editing."};
}

export async function configureTournamentCompetition(_previous:TournamentActionState|undefined,formData:FormData):Promise<TournamentActionState>{
  if(!(await requireAdmin()))return FORBIDDEN;const tournamentId=textValue(formData,"tournamentId");
  const {error}=await (await createClient()).rpc("configure_tournament_competition_v1",{p_tournament_id:tournamentId,p_group_ruleset:textValue(formData,"groupRuleset"),p_playoff_ruleset:textValue(formData,"playoffRuleset"),p_championship_path:textValue(formData,"championshipPath")});
  if(error)return {ok:false,error:"Lock the schedule first and choose an eligible championship path."};invalidateTournament(tournamentId);return {ok:true,message:"Competition format saved."};
}

export async function replaceTournamentRoster(_previous:TournamentActionState|undefined,formData:FormData):Promise<TournamentActionState>{
  if(!(await requireAdmin()))return FORBIDDEN;const tournamentId=textValue(formData,"tournamentId");const seatCount=Number(textValue(formData,"seatCount"));
  const playerIds=formData.getAll("playerIds").map(String).filter(Boolean);
  const {error}=await (await createClient()).rpc("replace_tournament_roster_v1",{p_tournament_id:tournamentId,p_seat_count:seatCount,p_player_ids:playerIds});
  if(error)return {ok:false,error:"Use unique active players and keep them within the selected capacity."};invalidateTournament(tournamentId);return {ok:true,message:"Roster and seed order saved."};
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
  if ((participants ?? []).length < 2 || (participants ?? []).length > 8) return { ok: false, error: "The draw needs 2 to 8 players." };

  const fixturePayload = roundRobinFixturePayload(tournament as TournamentSetup, (participants ?? []) as TournamentParticipantRow[]);
  const { error } = await supabase.rpc("replace_tournament_group_draw_v1", {
    p_tournament_id:tournamentId,p_group_fixtures:fixturePayload,
  });
  if (error) return { ok: false, error: "Couldn't generate the draw." };
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
    { data: replacement },
  ] = await Promise.all([
    supabase.from("tournaments").select("id, courts, group_ruleset, status, draw_locked_at").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("matches").select("id").eq("tournament_id", tournamentId).limit(1),
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
  const alreadyReplaced = !outgoing && currentParticipants.some((participant) => participant.player_id === replacementPlayerId);
  if (!outgoing && !alreadyReplaced) return { ok: false, error: "That player is not in this tournament." };
  if (outgoing && currentParticipants.some((participant) => participant.player_id === replacementPlayerId)) {
    return { ok: false, error: "That player is already in this tournament." };
  }
  if (!replacement || replacement.status !== "active") {
    return { ok: false, error: "Choose an active player as the replacement." };
  }
  const updatedParticipants = currentParticipants.map((participant) =>
    participant.player_id === outgoingPlayerId
      ? { ...participant, player_id: replacementPlayerId }
      : participant,
  );
  const fixturePayload = roundRobinFixturePayload(tournament as TournamentSetup, updatedParticipants);
  const { error: replacementError } = await supabase.rpc("replace_tournament_participant_v2", {
    p_tournament_id:tournamentId,p_outgoing_player_id:outgoingPlayerId,
    p_replacement_player_id:replacementPlayerId,p_group_fixtures:fixturePayload,
  });
  if (replacementError) return { ok: false, error: "Couldn't replace that player and regenerate the draw." };
  invalidateTournament(tournamentId);
  return { ok: true, message: "Player replaced and the draw was regenerated." };
}

export async function recordTournamentResult(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const fixtureId = textValue(formData, "fixtureId");

  const supabase = await createClient();
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, tournament_id, player1_id, player2_id, ruleset, skipped_at")
    .eq("id", fixtureId)
    .single();
  if (!fixture) return { ok: false, error: "Fixture not found." };
  if (fixture.skipped_at) return { ok: false, error: "That fixture was skipped when the tournament completed." };

  const setCount=fixture.ruleset==="best_of_3_standard"?3:1;
  const sets=Array.from({length:setCount},(_,index)=>{
    const suffix=String(index+1);const p1=textValue(formData,`p1Games${suffix}`)||(index===0?textValue(formData,"p1Games"):"");const p2=textValue(formData,`p2Games${suffix}`)||(index===0?textValue(formData,"p2Games"):"");
    const t1=textValue(formData,`tiebreakP1${suffix}`)||(index===0?textValue(formData,"tiebreakP1"):"");const t2=textValue(formData,`tiebreakP2${suffix}`)||(index===0?textValue(formData,"tiebreakP2"):"");
    return p1===""&&p2===""?null:{p1Games:Number(p1),p2Games:Number(p2),tiebreakP1:t1===""?null:Number(t1),tiebreakP2:t2===""?null:Number(t2)};
  }).filter((set):set is NonNullable<typeof set>=>set!==null);
  const validated = validateTournamentScore(fixture.ruleset as TournamentRuleset, fixture.player1_id, fixture.player2_id, sets);
  if (!validated.ok) return validated;

  const { data: recordedMatchId, error } = await supabase.rpc("record_tournament_result_v2", {
    p_fixture_id: fixture.id,
    p_winner_id: validated.winnerId,
    p_sets: validated.sets.map((set,index)=>({set_number:index+1,p1_games:set.p1Games,p2_games:set.p2Games,tiebreak_p1:set.tiebreakP1,tiebreak_p2:set.tiebreakP2})),
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
  return { ok: true, message: "Result approved and activity points rebuilt." };
}

async function loadTournamentResults(tournamentId: string) {
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }, { data: fixtures }, { data: matches }] = await Promise.all([
    supabase.from("tournaments").select("id, status, playoff_ruleset, championship_path, courts").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("fixtures").select("id, stage, round_number, slot_number, court_number, player1_id, player2_id").eq("tournament_id", tournamentId).order("round_number").order("slot_number").order("court_number"),
    supabase.from("matches").select("id, fixture_id, player1_id, player2_id, winner_id, status").eq("tournament_id", tournamentId),
  ]);
  const approved = (matches ?? []).filter((match) => match.status === "approved");
  const matchIds = approved.map((match) => match.id);
  const { data: sets } = matchIds.length
    ? await supabase.from("match_sets").select("match_id, p1_games, p2_games").in("match_id", matchIds)
    : { data: [] as Array<{ match_id: string; p1_games: number; p2_games: number }> };
  const scoreByMatch = new Map<string,{p1_games:number;p2_games:number}>();
  for(const set of sets??[]){const total=scoreByMatch.get(set.match_id)??{p1_games:0,p2_games:0};total.p1_games+=set.p1_games;total.p2_games+=set.p2_games;scoreByMatch.set(set.match_id,total)}
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

async function installTournamentStage(
  tournamentId: string,
  transition: "tiebreak" | "semifinal" | "final_stage",
  fixtures: Array<Record<string, unknown>>,
) {
  const db = await createClient();
  const { error } = await db.rpc("install_tournament_stage_v1", {
    p_tournament_id: tournamentId,
    p_transition: transition,
    p_fixtures: fixtures,
  });
  if (error) throw new Error(error.message ?? "Couldn't install the championship stage.");
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
  const path=state.tournament.championship_path as "standings"|"top_two_final"|"top_four_finals";
  const deciderFixture = state.fixtures.find((fixture) => fixture.stage === "tiebreak");
  const finalFixtures = state.fixtures.filter((fixture) => fixture.stage === "final" || fixture.stage === "playoff");
  const semifinalFixtures=state.fixtures.filter((fixture)=>fixture.stage==="semifinal");

  if (finalFixtures.length > 0) {
    if (finalFixtures.every((fixture) => state.resultByFixture.has(fixture.id))) {
      try { await finalizeTournament(tournamentId,"final_stage"); }
      catch { return { ok:false,error:"Couldn't complete the tournament." }; }
      try {
        await rebuildRatingCache();
      } catch {
        invalidateTournament(tournamentId);
        return { ok: true, message:"Tournament completed. Placement points need the organiser recovery rebuild.",warnings:["Run the organiser rating rebuild before result emails."] };
      }
      invalidateTournament(tournamentId);
      return { ok: true, message: "Tournament complete. The champion is official." };
    }
    return { ok: false, error: finalFixtures.length === 1 ? "Complete the final first." : "Complete the final and third-place match first." };
  }

  const maxGroupRound = Math.max(...groupFixtures.map((fixture) => fixture.round_number));
  const neededDecider=boundaryDecider(standings,path);
  if (neededDecider && !deciderFixture) {
    try { await installTournamentStage(tournamentId,"tiebreak",[{
      stage:"tiebreak",round_number:maxGroupRound+1,slot_number:1,court_number:1,
      player1_id:neededDecider[0],player2_id:neededDecider[1],
    }]); } catch { return { ok: false, error: "Couldn't create the qualification decider." }; }
    invalidateTournament(tournamentId);
    return { ok: true, message: "Qualification is tied. The decider is ready on Court 1." };
  }

  let ordered=[...standings];let nextRound=maxGroupRound+1;
  if (neededDecider) {
    const deciderResult = deciderFixture ? state.resultByFixture.get(deciderFixture.id) : null;
    if (!deciderResult?.winner_id) return { ok: false, error: "Complete the qualification decider first." };
    ordered=applyBoundaryDecider(standings,path,deciderResult.winner_id);nextRound++;
  }

  if(path==="standings"){
    try{await finalizeTournament(tournamentId,"round_robin")}catch{return {ok:false,error:"Couldn't complete the cup."}}
    try{await rebuildRatingCache()}catch(error){console.error("Cup completion recovery required",{tournamentId,error});invalidateTournament(tournamentId);return {ok:true,message:"Standings are final.",warnings:["Run the organiser rating rebuild."]}}
    invalidateTournament(tournamentId);return {ok:true,message:"Tournament complete. The standings champion is official."};
  }

  if(path==="top_four_finals"){
    if(semifinalFixtures.length===0){const semis=planTopFourSemifinals(ordered);try{await installTournamentStage(tournamentId,"semifinal",[
      {stage:"semifinal",round_number:nextRound,slot_number:1,court_number:1,player1_id:semis.semifinal1[0],player2_id:semis.semifinal1[1]},
      {stage:"semifinal",round_number:nextRound,slot_number:state.tournament.courts===1?2:1,court_number:Math.min(2,state.tournament.courts),player1_id:semis.semifinal2[0],player2_id:semis.semifinal2[1]},
    ])}catch{return {ok:false,error:"Couldn't create the semifinals."}}invalidateTournament(tournamentId);return {ok:true,message:"The semifinals are ready."}}
    const semifinalMatches=semifinalFixtures.map((fixture)=>state.resultByFixture.get(fixture.id));
    if(semifinalMatches.some((match)=>!match?.winner_id))return {ok:false,error:"Complete both semifinals first."};
    const winners=semifinalMatches.map((match)=>match!.winner_id!);const losers=semifinalMatches.map((match)=>match!.winner_id===match!.player1_id?match!.player2_id:match!.player1_id);
    try{await installTournamentStage(tournamentId,"final_stage",[
      {stage:"final",round_number:nextRound+1,slot_number:1,court_number:1,player1_id:winners[0],player2_id:winners[1]},
      {stage:"playoff",round_number:nextRound+1,slot_number:state.tournament.courts===1?2:1,court_number:Math.min(2,state.tournament.courts),player1_id:losers[0],player2_id:losers[1]},
    ])}catch{return {ok:false,error:"Couldn't create the championship matches."}}invalidateTournament(tournamentId);return {ok:true,message:"The final and third-place match are ready."};
  }

  const championshipFixtures:Array<Record<string,unknown>>=[
    {
      stage: "final", round_number: nextRound, slot_number: 1, court_number: 1,
      player1_id: ordered[0].playerId, player2_id: ordered[1].playerId,
    },
  ];
  if(ordered.length>=4)championshipFixtures.push({stage:"playoff",round_number:nextRound,slot_number:state.tournament.courts===1?2:1,court_number:Math.min(2,state.tournament.courts),player1_id:ordered[2].playerId,player2_id:ordered[3].playerId});
  try{await installTournamentStage(tournamentId,"final_stage",championshipFixtures)}catch{return { ok: false, error: "Couldn't create the final stage." };}
  invalidateTournament(tournamentId);
  return { ok: true, message: "The final and third-place match are ready." };
}

export async function overrideTournamentFinal(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  const finalistOneId = textValue(formData, "finalistOneId");
  const finalistTwoId = textValue(formData, "finalistTwoId");
  const reason = textValue(formData, "reason");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  if (!finalistOneId || !finalistTwoId || finalistOneId === finalistTwoId) {
    return { ok: false, error: "Choose two different finalists." };
  }
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, error: "Record a short reason between 10 and 500 characters." };
  }

  const { error } = await (await createClient()).rpc("override_tournament_final_v1", {
    p_tournament_id: tournamentId,
    p_finalist_one_id: finalistOneId,
    p_finalist_two_id: finalistTwoId,
    p_reason: reason,
  });
  if (error) {
    console.error("Tournament final override failed", {
      tournamentId,
      code: error.code ?? "unknown",
      message: error.message ?? "unknown",
    });
    const message = error.message ?? "";
    if (error.code === "PGRST202" || message.includes("override_tournament_final_v1")) {
      return { ok: false, error: "Director final override is not available in this deployment." };
    }
    if (message.includes("championship-stage result")) {
      return { ok: false, error: "The override closed when championship-stage scoring began." };
    }
    if (message.includes("round-robin")) return { ok: false, error: "Complete every group match first." };
    return { ok: false, error: "Couldn’t create the director-seeded final." };
  }
  invalidateTournament(tournamentId);
  return { ok: true, message: "Director override recorded. The group-format final is ready." };
}

export async function completeTournamentFromStandings(
  _previous: TournamentActionState | undefined,
  formData: FormData,
): Promise<TournamentActionState> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const tournamentId = textValue(formData, "tournamentId");
  if (!tournamentId) return { ok: false, error: "Tournament not found." };
  try{await finalizeTournament(tournamentId,"round_robin")}catch(error){const message=error instanceof Error?error.message:"";if(message.includes("round-robin"))return {ok:false,error:"Complete every round-robin fixture first."};if(message.includes("decider"))return {ok:false,error:"Complete the championship decider first."};return {ok:false,error:"This cup is not configured to finish from standings."}}
  try{await rebuildRatingCache()}catch(error){console.error("Standings completion recovery required",{tournamentId,error});invalidateTournament(tournamentId);return {ok:true,message:"Tournament complete from standings.",warnings:["Run the organiser rating rebuild before result emails."]}}
  invalidateTournament(tournamentId);return {ok:true,message:"Tournament complete. The round-robin standings are final."};
}
