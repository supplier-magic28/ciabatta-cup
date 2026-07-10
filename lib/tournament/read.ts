import "server-only";

import { displayName } from "@/lib/auth/displayName";
import { createClient } from "@/lib/supabase/server";
import { deriveTournamentStandings } from "./logic";
import type { TournamentResult } from "./types";

export async function loadTournamentBoard(tournamentId: string) {
  const supabase = await createClient();
  const [{ data: tournament }, { data: participants }, { data: fixtures }, { data: matches }, { data: players }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
    supabase.from("tournament_participants").select("player_id, seed").eq("tournament_id", tournamentId).order("seed"),
    supabase.from("fixtures").select("*").eq("tournament_id", tournamentId).order("round_number").order("court_number"),
    supabase.from("matches").select("id, fixture_id, player1_id, player2_id, winner_id, status").eq("tournament_id", tournamentId),
    supabase.from("players").select("id, first_name, last_name, email, avatar_url"),
  ]);

  if (!tournament) return null;
  const approved = (matches ?? []).filter((match) => match.status === "approved");
  const matchIds = approved.map((match) => match.id);
  const { data: sets } = matchIds.length
    ? await supabase
        .from("match_sets")
        .select("match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2")
        .in("match_id", matchIds)
        .order("set_number")
    : { data: [] as Array<{ match_id: string; set_number: number; p1_games: number; p2_games: number; tiebreak_p1: number | null; tiebreak_p2: number | null }> };

  const setsByMatch = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const current = setsByMatch.get(set.match_id) ?? [];
    current.push(set);
    setsByMatch.set(set.match_id, current);
  }
  const matchByFixture = new Map(approved.map((match) => [match.fixture_id, match]));
  const groupFixtureIds = new Set((fixtures ?? []).filter((fixture) => fixture.stage === "group").map((fixture) => fixture.id));
  const groupResults: TournamentResult[] = approved.flatMap((match) => {
    if (!match.fixture_id || !groupFixtureIds.has(match.fixture_id) || !match.winner_id) return [];
    const score = setsByMatch.get(match.id)?.[0];
    return score ? [{
      fixtureId: match.fixture_id,
      player1Id: match.player1_id,
      player2Id: match.player2_id,
      winnerId: match.winner_id,
      player1Games: score.p1_games,
      player2Games: score.p2_games,
    }] : [];
  });
  const standings = deriveTournamentStandings(
    (participants ?? []).map((participant) => ({ playerId: participant.player_id, seed: participant.seed })),
    groupResults,
  );
  const playerById = new Map((players ?? []).map((player) => [player.id, {
    ...player,
    name: displayName({ firstName: player.first_name, lastName: player.last_name, email: player.email }),
  }]));
  const finalFixture = (fixtures ?? []).find((fixture) => fixture.stage === "final");
  const championId = finalFixture ? matchByFixture.get(finalFixture.id)?.winner_id ?? null : null;

  return {
    tournament,
    participants: participants ?? [],
    fixtures: fixtures ?? [],
    matchByFixture,
    setsByMatch,
    standings,
    playerById,
    championId,
    completedResults: approved.length,
  };
}
