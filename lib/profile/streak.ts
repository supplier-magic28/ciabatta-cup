export const LEAGUE_TIME_ZONE = "Australia/Melbourne";

export type StreakMatchRow = {
  player1_id: string;
  player2_id: string | null;
  status: string;
  played_at: string;
};

export type StreakStats = {
  playedDays: Set<string>;
  currentStreak: number;
  bestStreak: number;
};

export function dateKeyInZone(value: Date | string, timeZone = LEAGUE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function deriveStreak(
  playerId: string,
  matches: readonly StreakMatchRow[],
  manualDays: readonly string[],
  todayKey: string,
): StreakStats {
  const playedDays = new Set(manualDays);
  for (const match of matches) {
    if (match.status === "rejected") continue;
    if (match.player1_id !== playerId && match.player2_id !== playerId) continue;
    playedDays.add(dateKeyInZone(match.played_at));
  }
  const ordered = [...playedDays].sort();
  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of ordered) {
    run = previous && shiftDateKey(previous, 1) === day ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = day;
  }
  const endpoint = playedDays.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let currentStreak = 0;
  for (let day = endpoint; playedDays.has(day); day = shiftDateKey(day, -1)) currentStreak += 1;
  return { playedDays, currentStreak, bestStreak };
}

export function streakWindow(playedDays: ReadonlySet<string>, todayKey: string, length: 7 | 30) {
  return Array.from({ length }, (_, index) => {
    const date = shiftDateKey(todayKey, index - length + 1);
    return { date, played: playedDays.has(date), today: date === todayKey };
  });
}
