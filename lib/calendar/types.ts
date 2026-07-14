import type { ActivityLedgerEntry, ActivityPointEvent } from "@/lib/scoring/activityPoints";

export type CalendarEventKind = "ranked" | "exhibition" | "external" | "cup" | "practice" | "planned";
export type CalendarView = "grid" | "list";
export type CalendarScreen = "calendar" | "day" | "event";
export type CalendarPreset = "7d" | "14d" | "30d" | "custom";
export type CalendarCupStatus = "draft" | "scheduled" | "live" | "completed" | "cancelled";

export type CalendarPerson = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  external: boolean;
};

export type CalendarOutcome = {
  label: string;
  detail: string;
  tone: "win" | "loss" | "neutral" | "future";
};

export type CalendarEvent = {
  key: string;
  kind: CalendarEventKind;
  sourceId: string;
  date: string;
  startsAt: string;
  title: string;
  subtitle: string;
  href: string;
  status: "past" | "future" | "awaiting_reply";
  points: number;
  won: boolean | null;
  surface: string | null;
  court: string | null;
  location: string | null;
  score: string | null;
  metadataMissing: boolean;
  coverImageUrl: string | null;
  coverCrop?:{frameShape:"wide"|"square"|"three_two";zoom:number;offsetX:number;offsetY:number}|null;
  participants: CalendarPerson[];
  outcome: CalendarOutcome;
  placement?: number | null;
  record?: { won: number; lost: number };
  cupStatus?: CalendarCupStatus;
};

export type CalendarUrlState = {
  preset: CalendarPreset;
  from: string;
  to: string;
  view: CalendarView;
  month: string;
  screen: CalendarScreen;
  day: string | null;
  event: string | null;
  back: "calendar" | "day" | "list";
  weekStart: "mon" | "sun";
  showExternal: boolean;
};

export type CalendarScorecard = {
  pointsEarned: number;
  decay: number;
  net: number;
  won: number;
  lost: number;
  streak: number;
  bestSurface: string | null;
  form: number;
};

export type CalendarPlayer = { id: string; name: string; avatarUrl: string | null };

export type CalendarData = {
  today: string;
  player: CalendarPlayer;
  rank: number | null;
  currentPoints: number;
  ledger: ActivityLedgerEntry[];
  timeline: ActivityPointEvent[];
  events: CalendarEvent[];
  nextOnCourt: CalendarEvent | null;
};
