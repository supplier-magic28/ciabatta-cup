const MELBOURNE_TIMEZONE = "Australia/Melbourne";

export type PlannedMatchFormat = "one_set" | "best_of_3" | "pro_set_8" | "custom";

export function formatPlannedDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: MELBOURNE_TIMEZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatPlayedDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: MELBOURNE_TIMEZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatLabel(format: PlannedMatchFormat, formatNote: string | null) {
  if (format === "one_set") return "SINGLE SET";
  if (format === "best_of_3") return "BEST OF 3";
  if (format === "pro_set_8") return "PRO SET";
  return formatNote?.trim().toUpperCase() || "CUSTOM FORMAT";
}

export function matchTypeLabel(
  type: "ranked" | "exhibition" | "unranked_external",
  format: PlannedMatchFormat,
  formatNote: string | null,
) {
  const prefix = type === "ranked" ? "RANKED" : type === "exhibition" ? "NON-RANKED" : "NON-CIABATTA";
  return `${prefix} · ${formatLabel(format, formatNote)}`;
}

export function resolveResultNames(input: {
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  externalWon: boolean;
  externalName: string | null;
  players: Array<{ id: string; firstName: string }>;
}) {
  const player1 = input.players.find((player) => player.id === input.player1Id)?.firstName ?? "Player";
  if (input.player2Id === null) {
    const external = input.externalName ?? "Opponent";
    return input.externalWon
      ? { winnerName: external, loserName: player1 }
      : { winnerName: player1, loserName: external };
  }

  const player2 = input.players.find((player) => player.id === input.player2Id)?.firstName ?? "Opponent";
  return input.winnerId === input.player2Id
    ? { winnerName: player2, loserName: player1 }
    : { winnerName: player1, loserName: player2 };
}
