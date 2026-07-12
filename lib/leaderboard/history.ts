export type WinLossRecord = { won: number; lost: number };

export type LeaderboardHistory = {
  trophies: number;
  rankedMatches: WinLossRecord;
  rankedSets: WinLossRecord;
  tournamentMatches: WinLossRecord;
  externalMatches: WinLossRecord;
};

export type LeaderboardMatchRow = {
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  type: string;
  status: string;
  tournament_id: string | null;
  fixture_id: string | null;
  match_sets: Array<{ p1_games: number; p2_games: number }> | null;
};

export type LeaderboardPlacementRow = {
  player_id: string;
  tournament_id: string;
  placement: number;
};

export type LeaderboardTournamentRow = { id: string; counts_as: string };
export type LeaderboardFixtureRow = { id: string; ruleset: string };

const emptyRecord = (): WinLossRecord => ({ won: 0, lost: 0 });

function recordResult(record: WinLossRecord, won: boolean) {
  if (won) record.won += 1;
  else record.lost += 1;
}

/** Derive leaderboard history entirely from approved match and placement facts. */
export function deriveLeaderboardHistory(
  playerIds: readonly string[],
  matches: readonly LeaderboardMatchRow[],
  placements: readonly LeaderboardPlacementRow[],
  tournaments: readonly LeaderboardTournamentRow[],
  fixtures: readonly LeaderboardFixtureRow[],
): Map<string, LeaderboardHistory> {
  const result = new Map(
    playerIds.map((playerId) => [playerId, {
      trophies: 0,
      rankedMatches: emptyRecord(),
      rankedSets: emptyRecord(),
      tournamentMatches: emptyRecord(),
      externalMatches: emptyRecord(),
    }]),
  );
  const rankedTournamentIds = new Set(
    tournaments.filter((tournament) => tournament.counts_as === "ranked").map((tournament) => tournament.id),
  );
  const fullSetFixtureIds = new Set(
    fixtures.filter((fixture) => fixture.ruleset === "standard_set_tiebreak_6_all").map((fixture) => fixture.id),
  );

  for (const placement of placements) {
    if (placement.placement === 1 && rankedTournamentIds.has(placement.tournament_id)) {
      const history = result.get(placement.player_id);
      if (history) history.trophies += 1;
    }
  }

  for (const match of matches) {
    if (match.status === "approved" && match.type === "unranked_external") {
      const history = result.get(match.player1_id);
      if (history) recordResult(history.externalMatches, match.winner_id === match.player1_id);
      continue;
    }
    if (
      match.status !== "approved" ||
      match.type !== "ranked" ||
      !match.winner_id ||
      (match.winner_id !== match.player1_id && match.winner_id !== match.player2_id)
    ) continue;

    const tournamentRanked = match.tournament_id != null && rankedTournamentIds.has(match.tournament_id);
    const ordinaryRanked = match.tournament_id == null;
    if (!ordinaryRanked && !tournamentRanked) continue;

    for (const playerId of [match.player1_id, match.player2_id]) {
      if (playerId === null) continue;
      const history = result.get(playerId);
      if (!history) continue;
      if (ordinaryRanked) recordResult(history.rankedMatches, match.winner_id === playerId);
      else recordResult(history.tournamentMatches, match.winner_id === playerId);

      const countsSets = ordinaryRanked || (match.fixture_id != null && fullSetFixtureIds.has(match.fixture_id));
      if (!countsSets) continue;
      const playerIsFirst = playerId === match.player1_id;
      for (const set of match.match_sets ?? []) {
        if (set.p1_games === set.p2_games) continue;
        const firstWon = set.p1_games > set.p2_games;
        recordResult(history.rankedSets, playerIsFirst ? firstWon : !firstWon);
      }
    }
  }

  return result;
}
