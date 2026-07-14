import type { ActivityLedgerEntry, ActivityPointEvent } from "@/lib/scoring/activityPoints";
import type { CalendarEvent, CalendarScorecard } from "./types";

export const eventsInRange = (events: readonly CalendarEvent[], from: string, to: string, showExternal = true) =>
  events.filter((event) => event.date >= from && event.date <= to && (showExternal || event.kind !== "external"));

export function groupCalendarEvents(events: readonly CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const rows = groups.get(event.date) ?? [];
    rows.push(event);
    groups.set(event.date, rows);
  }
  return groups;
}

export function deriveCalendarScorecard(
  events: readonly CalendarEvent[], ledger: readonly ActivityLedgerEntry[], timeline: readonly ActivityPointEvent[],
  from: string, to: string, showExternal = true,
): CalendarScorecard {
  const visible = eventsInRange(events, from, to, showExternal).filter((event) => event.status === "past");
  // Visibility filters are cosmetic. Point figures always remain exact slices
  // of the canonical ledger and therefore cannot change when a row is hidden.
  const visibleLedger = ledger.filter((entry) => entry.date >= from && entry.date <= to);
  const pointsEarned = visibleLedger.filter((entry) => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0);
  const decay = -visibleLedger.filter((entry) => entry.delta < 0).reduce((sum, entry) => sum + entry.delta, 0);
  const canonicalNet = timeline.filter((day) => day.date >= from && day.date <= to).reduce((sum, day) => sum + day.appliedDelta, 0);
  const results = visible.filter((event) => event.won != null);
  const won = results.filter((event) => event.won).length;
  const lost = results.length - won;
  let streak = 0;
  for (const event of [...results].sort((a, b) => b.startsAt.localeCompare(a.startsAt))) { if (!event.won) break; streak += 1; }
  const surfaces = new Map<string, { won: number; played: number }>();
  for (const event of results) if (event.surface) { const row = surfaces.get(event.surface) ?? { won: 0, played: 0 }; row.played += 1; if (event.won) row.won += 1; surfaces.set(event.surface, row); }
  const bestSurface = [...surfaces.entries()].filter(([, row]) => row.played >= 2).sort((a, b) => (b[1].won / b[1].played) - (a[1].won / a[1].played) || b[1].played - a[1].played)[0]?.[0] ?? null;
  const played = visible.length;
  const form = Math.min(99, Math.round(50 + (results.length ? (won / results.length) * 30 : 0) + Math.min(played, 12) * 1.2));
  return { pointsEarned, decay, net: canonicalNet, won, lost, streak, bestSurface, form };
}
