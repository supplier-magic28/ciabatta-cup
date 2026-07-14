import { shiftDateKey } from "@/lib/profile/streak";
import type { CalendarPreset, CalendarUrlState } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const span = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
const validDate = (value: unknown): value is string => typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

export function presetRange(today: string, preset: Exclude<CalendarPreset, "custom">) {
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  return { from: shiftDateKey(today, 1 - days), to: today };
}

export function clampCalendarRange(from: string, to: string, anchor: "from" | "to" = "to") {
  let start = validDate(from) ? from : to;
  let end = validDate(to) ? to : from;
  if (start > end) {
    if (anchor === "from") end = start;
    else start = end;
  }
  if (span(start, end) > 30) {
    if (anchor === "from") end = shiftDateKey(start, 29);
    else start = shiftDateKey(end, -29);
  }
  return { from: start, to: end };
}

export function parseCalendarState(params: Record<string, string | string[] | undefined>, today: string): CalendarUrlState {
  const rawPreset = typeof params.preset === "string" ? params.preset : "30d";
  const preset: CalendarPreset = ["7d", "14d", "30d", "custom"].includes(rawPreset) ? rawPreset as CalendarPreset : "30d";
  const defaults = preset === "custom" ? presetRange(today, "30d") : presetRange(today, preset);
  const range = preset === "custom" ? clampCalendarRange(validDate(params.from) ? params.from : defaults.from, validDate(params.to) ? params.to : defaults.to) : defaults;
  const month = typeof params.month === "string" && MONTH.test(params.month) ? params.month : today.slice(0, 7);
  const screen = params.screen === "day" || params.screen === "event" ? params.screen : "calendar";
  return {
    preset, ...range,
    view: params.view === "list" ? "list" : "grid",
    month, screen,
    day: validDate(params.day) ? params.day : null,
    event: typeof params.event === "string" ? params.event : null,
    back: params.back === "day" || params.back === "list" ? params.back : "calendar",
    weekStart: params.weekStart === "sun" ? "sun" : "mon",
    showExternal: params.external !== "0",
  };
}

export function calendarHref(state: CalendarUrlState, changes: Partial<CalendarUrlState>) {
  const next = { ...state, ...changes };
  const query = new URLSearchParams();
  if (next.preset !== "30d") query.set("preset", next.preset);
  if (next.preset === "custom") { query.set("from", next.from); query.set("to", next.to); }
  if (next.view !== "grid") query.set("view", next.view);
  if (next.month) query.set("month", next.month);
  if (next.screen !== "calendar") query.set("screen", next.screen);
  if (next.day) query.set("day", next.day);
  if (next.event) query.set("event", next.event);
  if (next.back !== "calendar") query.set("back", next.back);
  if (next.weekStart !== "mon") query.set("weekStart", next.weekStart);
  if (!next.showExternal) query.set("external", "0");
  return `/calendar?${query.toString()}`;
}

export function monthGrid(month: string, weekStart: "mon" | "sun") {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const leading = weekStart === "mon" ? (weekday + 6) % 7 : weekday;
  const start = shiftDateKey(first, -leading);
  return Array.from({ length: 42 }, (_, index) => shiftDateKey(start, index));
}
