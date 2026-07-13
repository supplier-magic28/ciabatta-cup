import { DECAY_PER_DAY, DROUGHT_30_PENALTY, DROUGHT_7_PENALTY, PRACTICE_POINTS, RANKED_PLAY_POINTS, RANKED_WIN_BONUS, RATING_FLOOR, UNRANKED_FLAT_POINTS } from "./constants";
import type { DecayWatch } from "./types";

export type ActivityMatch = { id: string; player1_id: string; player2_id: string | null; winner_id: string | null; type: "ranked" | "exhibition" | "unranked_external"; status: string; played_at: string; tournament_id: string | null };
export type PracticeFact = { id: string; player_id: string; practiced_on: string; status: string };
export type PlayDayFact = { player_id: string; played_on: string };
export type PlacementFact = { player_id: string; points: number; awarded_at: string };
export type ActivityPointsResult = { points: Map<string, number>; watches: Map<string, DecayWatch> };

const dayKey = (value: string) => value.slice(0, 10);
const shift = (key: string, amount: number) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };

export function computeActivityPoints(playerIds: readonly string[], matches: readonly ActivityMatch[], placements: readonly PlacementFact[], practices: readonly PracticeFact[], playDays: readonly PlayDayFact[], asOfDate: string): ActivityPointsResult {
  const earned = new Map(playerIds.map((id) => [id, 0]));
  const tennisDays = new Map(playerIds.map((id) => [id, new Set<string>()]));
  const add = (id: string | null, points: number) => { if (id && earned.has(id)) earned.set(id, (earned.get(id) ?? 0) + points); };
  const played = (id: string | null, date: string) => { if (id && tennisDays.has(id)) tennisDays.get(id)!.add(dayKey(date)); };
  for (const match of matches) {
    if (match.status !== "rejected") { played(match.player1_id, match.played_at); played(match.player2_id, match.played_at); }
    if (match.status !== "approved") continue;
    if (match.type === "ranked" && match.tournament_id == null) { add(match.player1_id, RANKED_PLAY_POINTS); add(match.player2_id, RANKED_PLAY_POINTS); add(match.winner_id, RANKED_WIN_BONUS); }
    else if (match.type === "exhibition") { add(match.player1_id, UNRANKED_FLAT_POINTS); add(match.player2_id, UNRANKED_FLAT_POINTS); }
    else if (match.type === "unranked_external") add(match.player1_id, UNRANKED_FLAT_POINTS);
  }
  for (const placement of placements) add(placement.player_id, placement.points);
  for (const practice of practices) if (practice.status === "approved") { played(practice.player_id, practice.practiced_on); add(practice.player_id, PRACTICE_POINTS); }
  for (const mark of playDays) played(mark.player_id, mark.played_on);
  const watches = new Map<string, DecayWatch>();
  for (const playerId of playerIds) {
    const days = tennisDays.get(playerId)!;
    const ordered = [...days].filter((date) => date <= asOfDate).sort();
    let drought = 0; let totalDecay = 0;
    if (ordered.length) for (let date = ordered[0]; date <= asOfDate; date = shift(date, 1)) {
      if (days.has(date)) drought = 0;
      else { drought++; totalDecay += DECAY_PER_DAY; if (drought % 7 === 0) totalDecay += DROUGHT_7_PENALTY; if (drought % 30 === 0) totalDecay += DROUGHT_30_PENALTY; }
    }
    const last = ordered.at(-1);
    const currentDrought = last ? daysBetween(last, asOfDate) : 0;
    const currentDecay = currentDrought + Math.floor(currentDrought / 7) * DROUGHT_7_PENALTY + Math.floor(currentDrought / 30) * DROUGHT_30_PENALTY;
    earned.set(playerId, Math.max(RATING_FLOOR, (earned.get(playerId) ?? 0) - totalDecay));
    watches.set(playerId, { daysSinceLastTennis: currentDrought, decayedSoFar: currentDecay, daysUntil7DayFine: currentDrought % 7 === 0 && currentDrought > 0 ? 7 : 7 - currentDrought % 7, daysUntil30DayFine: currentDrought % 30 === 0 && currentDrought > 0 ? 30 : 30 - currentDrought % 30, playedToday: days.has(asOfDate) });
  }
  return { points: earned, watches };
}

function daysBetween(from: string, to: string): number { return Math.max(0, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)); }
