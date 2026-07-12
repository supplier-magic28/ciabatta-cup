export const H2H_MIN_GAMES = 5;

export type HistorySet = { selfGames: number; opponentGames: number };
export type NormalizedHistoryMatch = {
  id: string;
  opponentKey: string | null;
  opponentName: string;
  external: boolean;
  savedExternal: boolean;
  won: boolean;
  playedAt: string;
  type: "ranked" | "exhibition" | "unranked_external";
  tournamentId: string | null;
  sets: HistorySet[];
  pointsDelta: number | null;
};

export type H2HSummary = {
  opponentKey: string;
  opponentName: string;
  external: boolean;
  played: number;
  unlocked: boolean;
  remaining: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  lastResult: "W" | "L" | null;
};

export type H2HCandidate = { opponentKey: string; opponentName: string; external: boolean };

export function deriveH2HSummaries(matches: readonly NormalizedHistoryMatch[], candidates: readonly H2HCandidate[] = []): H2HSummary[] {
  const summaries = new Map<string, H2HSummary>();
  for (const candidate of candidates) summaries.set(candidate.opponentKey, {
    ...candidate, played: 0, unlocked: false, remaining: H2H_MIN_GAMES,
    won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, lastResult: null,
  });
  for (const match of matches) {
    if (!match.opponentKey || (match.external && !match.savedExternal)) continue;
    const current = summaries.get(match.opponentKey) ?? {
      opponentKey: match.opponentKey, opponentName: match.opponentName, external: match.external,
      played: 0, unlocked: false, remaining: H2H_MIN_GAMES, won: 0, lost: 0,
      setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, lastResult: match.won ? "W" as const : "L" as const,
    };
    current.played += 1;
    if (match.won) current.won += 1; else current.lost += 1;
    for (const set of match.sets) {
      current.gamesWon += set.selfGames;
      current.gamesLost += set.opponentGames;
      if (set.selfGames > set.opponentGames) current.setsWon += 1;
      else if (set.opponentGames > set.selfGames) current.setsLost += 1;
    }
    const previousLatest = (current as H2HSummary & { latest?: string }).latest;
    if (!previousLatest || match.playedAt > previousLatest) {
      current.lastResult = match.won ? "W" : "L";
      (current as H2HSummary & { latest?: string }).latest = match.playedAt;
    }
    current.unlocked = current.played >= H2H_MIN_GAMES;
    current.remaining = Math.max(0, H2H_MIN_GAMES - current.played);
    summaries.set(match.opponentKey, current);
  }
  return [...summaries.values()].sort((a, b) => b.played - a.played || a.opponentName.localeCompare(b.opponentName));
}

export type TournamentHistoryInput = {
  id: string;
  name: string;
  startsAt: string;
  locationName: string;
  coverImageUrl: string | null;
  participantCount: number;
  structure: string;
  placement: number | null;
  points: number | null;
  matches: Array<{ winnerId: string | null; player1Id: string; player2Id: string }>;
};

export function deriveTournamentHistory(playerId: string, tournaments: readonly TournamentHistoryInput[]) {
  return tournaments.map((tournament) => {
    const played = tournament.matches.filter((match) => match.player1Id === playerId || match.player2Id === playerId);
    const won = played.filter((match) => match.winnerId === playerId).length;
    return { ...tournament, won, lost: played.length - won, champion: tournament.placement === 1 };
  }).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
