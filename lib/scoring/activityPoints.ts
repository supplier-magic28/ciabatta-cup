import { DECAY_PER_DAY, DROUGHT_30_PENALTY, DROUGHT_7_PENALTY, PRACTICE_POINTS, RANKED_PLAY_POINTS, RANKED_WIN_BONUS, RATING_FLOOR, UNRANKED_FLAT_POINTS } from "./constants";
import type { CiabattaReign, DecayWatch } from "./types";
import { dateKeyInZone, shiftDateKey } from "@/lib/profile/streak";

export type ActivityMatch = { id: string; player1_id: string; player2_id: string | null; winner_id: string | null; type: "ranked" | "exhibition" | "unranked_external"; status: string; played_at: string; tournament_id: string | null };
export type PracticeFact = { id: string; player_id: string; practiced_on: string; status: string };
export type PlayDayFact = { player_id: string; played_on: string };
export type PlacementFact = { player_id: string; points: number; awarded_at: string };
export type ActivityPointEvent = { date: string; points: number; delta: number; awards: number; decay: number };
export type ActivityPointsResult = { points: Map<string, number>; watches: Map<string, DecayWatch>; timelines: Map<string, ActivityPointEvent[]> };

const factDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dateKeyInZone(value);
const daysBetween = (from: string, to: string): number => Math.max(0, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000));

/** Replay every public activity-point input into current totals and safe history. */
export function computeActivityPoints(playerIds: readonly string[], matches: readonly ActivityMatch[], placements: readonly PlacementFact[], practices: readonly PracticeFact[], playDays: readonly PlayDayFact[], asOfDate: string): ActivityPointsResult {
  const roster = new Set(playerIds);
  const tennisDays = new Map(playerIds.map((id) => [id, new Set<string>()]));
  const awards = new Map(playerIds.map((id) => [id, new Map<string, number>()]));
  const played = (id: string | null, date: string) => { if (id && roster.has(id)) tennisDays.get(id)!.add(factDay(date)); };
  const award = (id: string | null, date: string, points: number) => {
    if (!id || !roster.has(id)) return;
    const day = factDay(date); const byDay = awards.get(id)!;
    byDay.set(day, (byDay.get(day) ?? 0) + points);
  };

  for (const match of matches) {
    if (match.status !== "rejected") { played(match.player1_id, match.played_at); played(match.player2_id, match.played_at); }
    if (match.status !== "approved") continue;
    if (match.type === "ranked" && match.tournament_id == null) {
      award(match.player1_id, match.played_at, RANKED_PLAY_POINTS);
      award(match.player2_id, match.played_at, RANKED_PLAY_POINTS);
      award(match.winner_id, match.played_at, RANKED_WIN_BONUS);
    } else if (match.type === "exhibition") {
      award(match.player1_id, match.played_at, UNRANKED_FLAT_POINTS);
      award(match.player2_id, match.played_at, UNRANKED_FLAT_POINTS);
    } else if (match.type === "unranked_external") award(match.player1_id, match.played_at, UNRANKED_FLAT_POINTS);
  }
  for (const placement of placements) award(placement.player_id, placement.awarded_at, placement.points);
  for (const practice of practices) if (practice.status === "approved") {
    played(practice.player_id, practice.practiced_on);
    award(practice.player_id, practice.practiced_on, PRACTICE_POINTS);
  }
  for (const mark of playDays) played(mark.player_id, mark.played_on);

  const points = new Map<string, number>();
  const timelines = new Map<string, ActivityPointEvent[]>();
  const watches = new Map<string, DecayWatch>();
  for (const playerId of playerIds) {
    const days = tennisDays.get(playerId)!;
    const awardDays = awards.get(playerId)!;
    const firstTennis = [...days].filter((date) => date <= asOfDate).sort()[0] ?? null;
    const firstEvent = [...days, ...awardDays.keys()].filter((date) => date <= asOfDate).sort()[0] ?? null;
    let raw = 0; let drought = 0;
    const timeline: ActivityPointEvent[] = [];
    if (firstEvent) for (let date = firstEvent; date <= asOfDate; date = shiftDateKey(date, 1)) {
      const dayAwards = awardDays.get(date) ?? 0;
      let dayDecay = 0;
      if (firstTennis && date >= firstTennis) {
        if (days.has(date)) drought = 0;
        else {
          drought += 1;
          dayDecay = DECAY_PER_DAY;
          if (drought % 7 === 0) dayDecay += DROUGHT_7_PENALTY;
          if (drought % 30 === 0) dayDecay += DROUGHT_30_PENALTY;
        }
      }
      if (dayAwards || dayDecay) {
        raw += dayAwards - dayDecay;
        timeline.push({ date, points: Math.max(RATING_FLOOR, raw), delta: dayAwards - dayDecay, awards: dayAwards, decay: dayDecay });
      }
    }
    const ordered = [...days].filter((date) => date <= asOfDate).sort();
    const last = ordered.at(-1);
    const currentDrought = last ? daysBetween(last, asOfDate) : 0;
    const currentDecay = currentDrought * DECAY_PER_DAY + Math.floor(currentDrought / 7) * DROUGHT_7_PENALTY + Math.floor(currentDrought / 30) * DROUGHT_30_PENALTY;
    points.set(playerId, Math.max(RATING_FLOOR, raw));
    timelines.set(playerId, timeline);
    watches.set(playerId, { daysSinceLastTennis: currentDrought, decayedSoFar: currentDecay, daysUntil7DayFine: currentDrought % 7 === 0 && currentDrought > 0 ? 7 : 7 - currentDrought % 7, daysUntil30DayFine: currentDrought % 30 === 0 && currentDrought > 0 ? 30 : 30 - currentDrought % 30, playedToday: days.has(asOfDate) });
  }
  return { points, watches, timelines };
}

/**
 * Rebuild Ciabatta ownership from the same daily activity-point history shown
 * publicly. The incumbent keeps the title on a tie; only a strictly higher
 * total starts a new reign.
 */
export function deriveActivityReigns(
  playerIds: readonly string[],
  timelines: ReadonlyMap<string, readonly ActivityPointEvent[]>,
): CiabattaReign[] {
  const points = new Map(playerIds.map((playerId) => [playerId, 0]));
  const eventsByDate = new Map<string, Array<{ playerId: string; points: number }>>();
  for (const playerId of playerIds) {
    for (const event of timelines.get(playerId) ?? []) {
      const events = eventsByDate.get(event.date) ?? [];
      events.push({ playerId, points: event.points });
      eventsByDate.set(event.date, events);
    }
  }

  const reigns: CiabattaReign[] = [];
  let holderId: string | null = null;
  for (const date of [...eventsByDate.keys()].sort()) {
    for (const event of eventsByDate.get(date) ?? []) points.set(event.playerId, event.points);
    const highest = Math.max(0, ...points.values());
    if (highest <= 0) continue;

    const incumbent: string | null = holderId;
    const holderPoints: number = incumbent === null ? -1 : (points.get(incumbent) ?? 0);
    if (incumbent !== null && holderPoints === highest) continue;
    const challenger: string | undefined = [...points.entries()]
      .filter(([playerId, total]) => playerId !== incumbent && total === highest && total > holderPoints)
      .map(([playerId]) => playerId)
      .sort((a, b) => a.localeCompare(b))[0];
    if (!challenger) continue;

    const changedAt = `${date}T00:00:00.000Z`;
    const current = reigns.at(-1);
    if (current) current.endedAt = changedAt;
    reigns.push({ playerId: challenger, startedAt: changedAt, endedAt: null });
    holderId = challenger;
  }
  return reigns;
}
