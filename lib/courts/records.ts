import { SURFACES, type Surface } from "./types";

export interface SurfaceMatch {
  type: "ranked" | "exhibition" | "unranked_external";
  tournamentId: string | null;
  surface: Surface | null;
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
}

export function deriveSurfaceRecords(playerId: string, matches: readonly SurfaceMatch[]) {
  const records = new Map(SURFACES.map((surface) => [surface, { surface, won: 0, lost: 0, played: 0, winPercent: 0 }]));
  let untagged = 0;
  for (const match of matches) {
    const participates = match.player1Id === playerId || match.player2Id === playerId;
    const eligible = match.type === "ranked" || Boolean(match.tournamentId);
    if (!participates || !eligible) continue;
    if (!match.surface) { untagged++; continue; }
    const record = records.get(match.surface)!;
    record.played++;
    if (match.winnerId === playerId) record.won++; else record.lost++;
    record.winPercent = Math.round((record.won / record.played) * 100);
  }
  return { records: SURFACES.map((surface) => records.get(surface)!), untagged };
}

