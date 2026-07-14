import "server-only";

import { displayName } from "@/lib/auth/displayName";
import type { SessionPlayer } from "@/lib/auth/session";
import { formatScore } from "@/lib/match/score";
import { dateKeyInZone } from "@/lib/profile/streak";
import { loadPublicLadderProjection } from "@/lib/scoring/publicProjection";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeCalendarEvent } from "./model";
import type { CalendarData, CalendarEvent, CalendarPerson } from "./types";

type Relation<T> = T | T[] | null;
const one = <T>(value: Relation<T>): T | null => Array.isArray(value) ? (value[0] ?? null) : value;
const ordinal = (value: number | null) => value == null ? "Placement pending" : `${value}${value % 10 === 1 && value !== 11 ? "st" : value % 10 === 2 && value !== 12 ? "nd" : value % 10 === 3 && value !== 13 ? "rd" : "th"}`;

export async function loadPersonalCalendar(session: SessionPlayer, today = dateKeyInZone(new Date()), now = new Date().toISOString()): Promise<CalendarData> {
  const db = createAdminClient();
  const [playersResult, matchesResult, externalResult, practicesResult, plansResult, entriesResult, tournamentsResult, placementsResult, tournamentMatchesResult] = await Promise.all([
    db.from("players").select("id,first_name,last_name,email,nickname,use_nickname,avatar_url,status").eq("status", "active"),
    db.from("matches").select("id,type,status,played_at,location,court_id,surface,player1_id,player2_id,winner_id,external_won,tournament_id,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2),courts(name)").eq("status", "approved").or(`player1_id.eq.${session.id},player2_id.eq.${session.id}`),
    db.from("external_match_details").select("match_id,owner_id,opponent_name").eq("owner_id", session.id),
    db.from("practice_sessions").select("id,player_id,activity,minutes,practiced_on,status").eq("player_id", session.id).eq("status", "approved"),
    db.from("planned_matches").select("id,created_by,opponent_player_id,opponent_external_id,scheduled_at,location,court_id,status,courts(name),external_opponents(display_name)").or(`created_by.eq.${session.id},opponent_player_id.eq.${session.id}`).in("status", ["proposed", "locked_in"]),
    db.from("tournament_participants").select("tournament_id").eq("player_id", session.id),
    db.from("tournaments").select("id,name,status,starts_at,location_name,court_id,default_surface,cover_image_url,cover_frame_shape,cover_zoom,cover_offset_x,cover_offset_y,courts(name)"),
    db.from("tournament_placements").select("tournament_id,player_id,placement,points").eq("player_id", session.id),
    db.from("matches").select("id,tournament_id,player1_id,player2_id,winner_id,status").eq("status", "approved").not("tournament_id", "is", null),
  ]);
  const failed = [playersResult, matchesResult, externalResult, practicesResult, plansResult, entriesResult, tournamentsResult, placementsResult, tournamentMatchesResult].find((result) => result.error);
  if (failed?.error) throw new Error("Couldn't load your tennis calendar.");

  const players = playersResult.data ?? [];
  const playerIds = players.map((player) => player.id);
  const projection = await loadPublicLadderProjection(playerIds, today);
  const names = new Map(players.map((player) => [player.id, displayName({ firstName: player.first_name, lastName: player.last_name, email: player.email, nickname: player.nickname, useNickname: player.use_nickname })]));
  const people = new Map<string, CalendarPerson>(players.map((player) => [player.id, { id: player.id, name: names.get(player.id) ?? "Player", avatarUrl: player.avatar_url, external: false }]));
  const profile = players.find((player) => player.id === session.id);
  const self = people.get(session.id) ?? { id: session.id, name: session.email, avatarUrl: null, external: false };
  const ledger = projection.cache.activityLedgers.get(session.id) ?? [];
  const timeline = projection.cache.activityTimelines.get(session.id) ?? [];
  const ranking = projection.cache.rankings.find((row) => row.playerId === session.id);
  const pointsBySource = new Map<string, number>();
  for (const entry of ledger) if (entry.delta > 0) pointsBySource.set(entry.sourceId, (pointsBySource.get(entry.sourceId) ?? 0) + entry.delta);
  const externalNames = new Map((externalResult.data ?? []).map((row) => [row.match_id, row.opponent_name]));
  const events: CalendarEvent[] = [];

  for (const match of matchesResult.data ?? []) {
    if (match.tournament_id) continue;
    const external = match.type === "unranked_external";
    const opponentId = match.player1_id === session.id ? match.player2_id : match.player1_id;
    const first = match.player1_id === session.id;
    const sets = (match.match_sets ?? []).slice().sort((a, b) => a.set_number - b.set_number).map((set) => ({ p1Games: first ? set.p1_games : set.p2_games, p2Games: first ? set.p2_games : set.p1_games, tiebreakP1: first ? set.tiebreak_p1 : set.tiebreak_p2, tiebreakP2: first ? set.tiebreak_p2 : set.tiebreak_p1 }));
    const kind = external ? "external" : match.type === "exhibition" ? "exhibition" : "ranked";
    const court = one(match.courts)?.name ?? null;
    const opponentName = external ? (externalNames.get(match.id) ?? "Non-Ciabatta opponent") : (names.get(opponentId ?? "") ?? "Opponent");
    const opponent = external ? { id: null, name: opponentName, avatarUrl: null, external: true } : (people.get(opponentId ?? "") ?? { id: opponentId, name: opponentName, avatarUrl: null, external: false });
    events.push(completeCalendarEvent({
      key: `${kind}:${match.id}`, kind, sourceId: match.id, date: dateKeyInZone(match.played_at), startsAt: match.played_at,
      title: `vs ${opponentName}`,
      subtitle: external ? "Non-Ciabatta" : match.type === "exhibition" ? "Exhibition" : "Ranked match",
      href: !match.court_id || !match.surface ? "/matches/untagged" : "/matches", status: "past", points: pointsBySource.get(match.id) ?? 0,
      won: external ? !match.external_won : match.winner_id === session.id, surface: match.surface, court, location: match.location,
      score: formatScore(sets), metadataMissing: !match.court_id || !match.surface, coverImageUrl: null, participants: [self, opponent],
    }));
  }

  for (const practice of practicesResult.data ?? []) events.push(completeCalendarEvent({
    key: `practice:${practice.id}`, kind: "practice", sourceId: practice.id, date: practice.practiced_on, startsAt: `${practice.practiced_on}T12:00:00.000Z`,
    title: practice.activity === "serves" ? "Serve practice" : practice.activity === "wall_hits" ? "Wall hits" : "Solo practice",
    subtitle: `${practice.minutes} minutes`, href: "/practice/new", status: "past", points: pointsBySource.get(practice.id) ?? 0,
    won: null, surface: null, court: "Not recorded", location: null, score: null, metadataMissing: false, coverImageUrl: null, participants: [self],
  }));

  for (const plan of plansResult.data ?? []) {
    const external = Boolean(plan.opponent_external_id);
    const relation = one(plan.external_opponents);
    const opponentId = plan.created_by === session.id ? plan.opponent_player_id : plan.created_by;
    const opponent = external ? (relation?.display_name ?? "Non-Ciabatta opponent") : (names.get(opponentId ?? "") ?? "Opponent");
    const opponentPerson = external ? { id: null, name: opponent, avatarUrl: null, external: true } : (people.get(opponentId ?? "") ?? { id: opponentId, name: opponent, avatarUrl: null, external: false });
    events.push(completeCalendarEvent({ key: `planned:${plan.id}`, kind: "planned", sourceId: plan.id, date: dateKeyInZone(plan.scheduled_at), startsAt: plan.scheduled_at, title: `vs ${opponent}`, subtitle: plan.status === "proposed" ? "Awaiting reply" : "Locked in", href: `/matches/${plan.id}`, status: plan.status === "proposed" ? "awaiting_reply" : plan.scheduled_at >= now ? "future" : "past", points: 0, won: null, surface: null, court: one(plan.courts)?.name ?? null, location: plan.location || null, score: null, metadataMissing: false, coverImageUrl: null, participants: [self, opponentPerson] }));
  }

  const entered = new Set((entriesResult.data ?? []).map((row) => row.tournament_id));
  const placementByTournament = new Map((placementsResult.data ?? []).map((row) => [row.tournament_id, row]));
  for (const tournament of (tournamentsResult.data ?? []).filter((row) => entered.has(row.id))) {
    const fixtures = (tournamentMatchesResult.data ?? []).filter((match) => match.tournament_id === tournament.id && (match.player1_id === session.id || match.player2_id === session.id));
    const won = fixtures.filter((match) => match.winner_id === session.id).length;
    const placement = placementByTournament.get(tournament.id);
    events.push(completeCalendarEvent({ key: `cup:${tournament.id}`, kind: "cup", sourceId: tournament.id, date: dateKeyInZone(tournament.starts_at), startsAt: tournament.starts_at, title: tournament.name, subtitle: `${won}-${fixtures.length - won} fixtures · ${ordinal(placement?.placement ?? null)}`, href: `/tournaments/${tournament.id}`, status: tournament.status === "completed" || dateKeyInZone(tournament.starts_at) < today ? "past" : "future", points: pointsBySource.get(tournament.id) ?? placement?.points ?? 0, won: placement?.placement === 1 ? true : null, surface: tournament.default_surface, court: one(tournament.courts)?.name ?? null, location: tournament.location_name, score: null, metadataMissing: false, coverImageUrl: tournament.cover_image_url, coverCrop:{frameShape:tournament.cover_frame_shape,zoom:Number(tournament.cover_zoom),offsetX:Number(tournament.cover_offset_x),offsetY:Number(tournament.cover_offset_y)}, participants: [], placement: placement?.placement ?? null, record: { won, lost: fixtures.length - won } }));
  }

  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.key.localeCompare(b.key));
  const futurePlans = events.filter((event) => event.kind === "planned" && event.startsAt >= now);
  const nextOnCourt = futurePlans.find((event) => event.status === "future") ?? futurePlans.find((event) => event.status === "awaiting_reply") ?? null;
  return { today, player: { id: session.id, name: names.get(session.id) ?? session.email, avatarUrl: profile?.avatar_url ?? null }, rank: ranking?.rank ?? null, currentPoints: ranking?.rating ?? 0, ledger, timeline, events, nextOnCourt };
}
