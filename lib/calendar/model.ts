import type { ActivityLedgerEntry, ActivityPointEvent } from "@/lib/scoring/activityPoints";
import type { CalendarCupStatus, CalendarEvent, CalendarEventKind, CalendarOutcome, CalendarScorecard } from "./types";

export function includeTournamentOnCalendar(input: {
  status: CalendarCupStatus;
  createdBy: string;
  isParticipant: boolean;
}, playerId: string) {
  return input.status !== "cancelled" && (
    input.status === "draft" || input.isParticipant || input.createdBy === playerId
  );
}

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

export function recentHistoricEvents(events: readonly CalendarEvent[], showExternal: boolean, limit = 5) {
  return events
    .filter((event) => event.status === "past" && event.kind !== "planned" && (showExternal || event.kind !== "external"))
    .slice()
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || b.key.localeCompare(a.key))
    .slice(0, limit);
}

const placementLabel = (placement: number) => `${placement}${placement % 10 === 1 && placement !== 11 ? "st" : placement % 10 === 2 && placement !== 12 ? "nd" : placement % 10 === 3 && placement !== 13 ? "rd" : "th"} place`;

export function deriveCalendarOutcome(input: {
  kind: CalendarEventKind;
  status: CalendarEvent["status"];
  won?: boolean | null;
  score?: string | null;
  placement?: number | null;
  record?: { won: number; lost: number };
  cupStatus?: CalendarCupStatus;
  subtitle: string;
}): CalendarOutcome {
  if (input.kind === "planned") return input.status === "awaiting_reply"
    ? { label: "Awaiting reply", detail: input.subtitle, tone: "future" }
    : { label: "Locked in", detail: input.subtitle, tone: "future" };
  if (input.kind === "practice") return { label: "Completed", detail: input.subtitle, tone: "neutral" };
  if (input.kind === "cup") {
    if (input.cupStatus === "draft") return { label: "Draft cup", detail: "Field not locked", tone: "future" };
    const detail = input.record ? `${input.record.won}-${input.record.lost} fixtures` : input.subtitle;
    if (input.status === "future") return { label: "Upcoming cup", detail, tone: "future" };
    if (input.placement === 1) return { label: "Cup winner", detail, tone: "win" };
    if (input.placement) return { label: placementLabel(input.placement), detail, tone: "neutral" };
    return { label: "Completed", detail, tone: "neutral" };
  }
  if (input.won === true) return { label: "You won", detail: input.score || input.subtitle, tone: "win" };
  if (input.won === false) return { label: "You lost", detail: input.score || input.subtitle, tone: "loss" };
  return { label: input.status === "future" ? "Upcoming" : "Completed", detail: input.score || input.subtitle, tone: input.status === "future" ? "future" : "neutral" };
}

export function completeCalendarEvent(event: Omit<CalendarEvent, "outcome">): CalendarEvent {
  return { ...event, outcome: deriveCalendarOutcome(event) };
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
