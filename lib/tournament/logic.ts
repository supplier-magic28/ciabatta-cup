import type {
  TournamentChampionshipPath,
  FinalStagePlan,
  RoundRobinRound,
  TournamentResult,
  TournamentStanding,
} from "./types";

export function qualificationCutoff(path: TournamentChampionshipPath, playerCount: number): number {
  if (path === "standings") return 1;
  if (path === "top_two_final") return Math.min(2, playerCount);
  if (playerCount < 4) throw new Error("Top-four finals require at least four players.");
  return 4;
}

/** The two players immediately across a wins-tied qualification boundary. */
export function boundaryDecider(
  standings: readonly TournamentStanding[],
  path: TournamentChampionshipPath,
): readonly [string, string] | null {
  const cutoff = qualificationCutoff(path, standings.length);
  if (cutoff >= standings.length || standings[cutoff - 1].won !== standings[cutoff].won) return null;
  return [standings[cutoff - 1].playerId, standings[cutoff].playerId];
}

export function applyBoundaryDecider(
  standings: readonly TournamentStanding[],
  path: TournamentChampionshipPath,
  winnerId: string,
): TournamentStanding[] {
  const pair = boundaryDecider(standings, path);
  if (!pair || !pair.includes(winnerId)) throw new Error("The boundary decider winner must be a participant.");
  if (pair[0] === winnerId) return [...standings];
  const next = [...standings];
  const first = next.findIndex((row) => row.playerId === pair[0]);
  const second = next.findIndex((row) => row.playerId === pair[1]);
  [next[first], next[second]] = [next[second], next[first]];
  return next;
}

export function planTopFourSemifinals(standings: readonly TournamentStanding[]) {
  if (standings.length < 4) throw new Error("Top-four finals require at least four players.");
  return {
    semifinal1: [standings[0].playerId, standings[3].playerId] as const,
    semifinal2: [standings[1].playerId, standings[2].playerId] as const,
  };
}

/** Deterministic circle-method draw. Participant order is the seed order. */
export function generateRoundRobin(participantIds: readonly string[], courts: number): RoundRobinRound[] {
  if (participantIds.length < 2) throw new Error("A tournament needs at least two players.");
  if (!Number.isInteger(courts) || courts < 1) throw new Error("A tournament needs at least one court.");
  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error("Tournament participants must be unique.");
  }

  const padded: Array<string | null> = [...participantIds];
  if (padded.length % 2 === 1) padded.push(null);

  const fixed = padded[0];
  const ring = padded.slice(1);
  const rounds: RoundRobinRound[] = [];

  for (let roundIndex = 0; roundIndex < ring.length; roundIndex++) {
    const pairs: Array<readonly [string | null, string | null]> = [[fixed, ring[roundIndex]]];
    for (let offset = 1; offset < padded.length / 2; offset++) {
      pairs.push([
        ring[(roundIndex + offset) % ring.length],
        ring[(roundIndex - offset + ring.length) % ring.length],
      ]);
    }

    const restingPlayerId = pairs.find(([a, b]) => a === null || b === null)?.find(Boolean) ?? null;
    const playable = pairs.filter((pair): pair is readonly [string, string] => Boolean(pair[0] && pair[1]));
    const fixtures = playable.map(([player1Id, player2Id], index) => ({
      roundNumber: roundIndex + 1,
      slotNumber: Math.floor(index / courts) + 1,
      courtNumber: (index % courts) + 1,
      player1Id,
      player2Id,
    }));

    rounds.push({ roundNumber: roundIndex + 1, restingPlayerId, fixtures });
  }

  return rounds;
}

export function deriveTournamentStandings(
  participants: readonly { playerId: string; seed: number }[],
  results: readonly TournamentResult[],
): TournamentStanding[] {
  const standings = new Map<string, TournamentStanding>();
  for (const participant of participants) {
    standings.set(participant.playerId, {
      playerId: participant.playerId,
      seed: participant.seed,
      played: 0,
      won: 0,
      lost: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDifference: 0,
    });
  }

  for (const result of results) {
    const player1 = standings.get(result.player1Id);
    const player2 = standings.get(result.player2Id);
    if (!player1 || !player2 || ![result.player1Id, result.player2Id].includes(result.winnerId)) continue;

    player1.played++;
    player2.played++;
    player1.gamesWon += result.player1Games;
    player1.gamesLost += result.player2Games;
    player2.gamesWon += result.player2Games;
    player2.gamesLost += result.player1Games;
    if (result.winnerId === result.player1Id) {
      player1.won++;
      player2.lost++;
    } else {
      player2.won++;
      player1.lost++;
    }
  }

  for (const standing of standings.values()) {
    standing.gameDifference = standing.gamesWon - standing.gamesLost;
  }

  // Head-to-head is a mini-league inside an otherwise tied wins/game-difference
  // cohort. This is deterministic for two-way and multi-way ties and mirrors
  // the authoritative database standings function.
  const headToHeadWins = new Map<string, number>();
  for (const result of results) {
    const winner = standings.get(result.winnerId);
    const loserId = result.winnerId === result.player1Id ? result.player2Id : result.player1Id;
    const loser = standings.get(loserId);
    if (winner && loser && winner.won === loser.won && winner.gameDifference === loser.gameDifference) {
      headToHeadWins.set(result.winnerId, (headToHeadWins.get(result.winnerId) ?? 0) + 1);
    }
  }

  return [...standings.values()].sort((a, b) => {
    if (a.won !== b.won) return b.won - a.won;
    if (a.gameDifference !== b.gameDifference) return b.gameDifference - a.gameDifference;
    const headToHead = (headToHeadWins.get(b.playerId) ?? 0) - (headToHeadWins.get(a.playerId) ?? 0);
    if (headToHead !== 0) return headToHead;
    return a.seed - b.seed || a.playerId.localeCompare(b.playerId);
  });
}

/** Plan a four-player final stage, adding an on-court decider across the 2/3 boundary. */
export function planFinalStage(standings: readonly TournamentStanding[]): FinalStagePlan {
  if (standings.length !== 4) throw new Error("The first tournament release requires four players.");

  if (standings[1].won !== standings[2].won) {
    return {
      kind: "finals",
      final: [standings[0].playerId, standings[1].playerId],
      playoff: [standings[2].playerId, standings[3].playerId],
    };
  }

  const boundaryWins = standings[1].won;
  const tied = standings.filter((standing) => standing.won === boundaryWins);
  const above = standings.filter((standing) => standing.won > boundaryWins);
  const below = standings.filter((standing) => standing.won < boundaryWins);

  const securedFinalistId = above[0]?.playerId ?? tied[0].playerId;
  const candidates = above.length > 0 ? tied.slice(0, 2) : tied.slice(1, 3);
  const excluded = standings.find(
    (standing) =>
      standing.playerId !== securedFinalistId &&
      !candidates.some((candidate) => candidate.playerId === standing.playerId),
  );

  return {
    kind: "decider",
    decider: [candidates[0].playerId, candidates[1].playerId],
    securedFinalistId,
    placementPlayerId: below[0]?.playerId ?? excluded!.playerId,
  };
}

export function resolveDecider(
  plan: Extract<FinalStagePlan, { kind: "decider" }>,
  winnerId: string,
): Extract<FinalStagePlan, { kind: "finals" }> {
  if (!plan.decider.includes(winnerId)) throw new Error("The decider winner must be a participant.");
  const loserId = plan.decider.find((playerId) => playerId !== winnerId)!;
  return {
    kind: "finals",
    final: [plan.securedFinalistId, winnerId],
    playoff: [loserId, plan.placementPlayerId],
  };
}

/** Final placement order when the director completes from group standings. */
export function resolveRoundRobinPlacements(
  standings: readonly TournamentStanding[],
  deciderWinnerId: string | null,
): TournamentStanding[] {
  const plan = planFinalStage(standings);
  if (plan.kind === "finals") return [...standings];
  if (!deciderWinnerId || !plan.decider.includes(deciderWinnerId)) {
    throw new Error("A completed qualification decider is required.");
  }
  const loserId = plan.decider.find((playerId) => playerId !== deciderWinnerId)!;
  const byId = new Map(standings.map((standing) => [standing.playerId, standing]));
  return [
    plan.securedFinalistId,
    deciderWinnerId,
    loserId,
    plan.placementPlayerId,
  ].map((playerId) => byId.get(playerId)!);
}
