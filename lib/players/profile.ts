import { computeRankings } from "../scoring";
import type { ScoreSet } from "../match/score";
import type { Match, MatchType } from "../scoring";

export interface ProfileMatch extends Match {
  sets: ScoreSet[];
}

export interface MatchRecord {
  won: number;
  lost: number;
  played: number;
}

export interface HeadToHeadRecord extends MatchRecord {
  opponentId: string;
}

export interface ProfileMatchLogEntry {
  id: string;
  opponentId: string;
  type: MatchType;
  won: boolean;
  playedAt: string;
  sets: ScoreSet[];
}

export interface PlayerProfileData {
  ranked: MatchRecord;
  exhibition: MatchRecord;
  pointsTrend: Array<{ playedAt: string; points: number }>;
  headToHead: HeadToHeadRecord[];
  matchLog: ProfileMatchLogEntry[];
}

const emptyRecord = (): MatchRecord => ({ won: 0, lost: 0, played: 0 });

function recordFor(matches: ProfileMatch[], playerId: string, type: MatchType): MatchRecord {
  const record = emptyRecord();
  for (const match of matches) {
    if (match.status !== "approved" || match.type !== type) continue;
    if (match.player1Id !== playerId && match.player2Id !== playerId) continue;

    record.played += 1;
    if (match.winnerId === playerId) record.won += 1;
    else record.lost += 1;
  }
  return record;
}

/** Derive every profile statistic from approved immutable match facts. */
export function derivePlayerProfile(playerId: string, matches: ProfileMatch[]): PlayerProfileData {
  const approved = matches.filter(
    (match) =>
      match.status === "approved" && (match.player1Id === playerId || match.player2Id === playerId),
  );
  const scoring = computeRankings(matches);
  const headToHead = new Map<string, HeadToHeadRecord>();

  for (const match of approved) {
    const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
    const record = headToHead.get(opponentId) ?? { opponentId, ...emptyRecord() };
    record.played += 1;
    if (match.winnerId === playerId) record.won += 1;
    else record.lost += 1;
    headToHead.set(opponentId, record);
  }

  return {
    ranked: recordFor(matches, playerId, "ranked"),
    exhibition: recordFor(matches, playerId, "exhibition"),
    pointsTrend: scoring.ratingHistory
      .filter((entry) => entry.playerId === playerId)
      .map((entry) => ({ playedAt: entry.playedAt, points: entry.pointsAfter })),
    headToHead: [...headToHead.values()].sort(
      (a, b) => b.played - a.played || b.won - a.won || a.opponentId.localeCompare(b.opponentId),
    ),
    matchLog: approved
      .slice()
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.id.localeCompare(a.id))
      .map((match) => ({
        id: match.id,
        opponentId: match.player1Id === playerId ? match.player2Id : match.player1Id,
        type: match.type,
        won: match.winnerId === playerId,
        playedAt: match.playedAt,
        sets: match.sets,
      })),
  };
}
