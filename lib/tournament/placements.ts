export const PLACEMENT_POINTS: Readonly<Record<number, number>> = { 1: 100, 2: 50, 3: 20, 4: 10, 5: 0, 6: 0, 7: 0, 8: 0 };

type Placement = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Fixture = { id: string; stage: string; round_number: number };
type Match = { id: string; fixture_id: string | null; player1_id: string; player2_id: string; winner_id: string | null; status: string; played_at: string };
type SetRow = { match_id: string; set_number?:number; p1_games: number; p2_games: number; tiebreak_p1: number | null; tiebreak_p2: number | null };

export type OfficialPlacement = {
  playerId: string;
  placement: Placement;
  points: number;
  matches: Array<{ opponentId: string; score: string; won: boolean }>;
};

function scoreForPlayer(match: Match, set: SetRow, playerId: string) {
  const first = playerId === match.player1_id;
  const own = first ? set.p1_games : set.p2_games;
  const other = first ? set.p2_games : set.p1_games;
  const ownTb = first ? set.tiebreak_p1 : set.tiebreak_p2;
  const otherTb = first ? set.tiebreak_p2 : set.tiebreak_p1;
  return ownTb != null && otherTb != null ? `${own}-${other} (${ownTb}-${otherTb})` : `${own}-${other}`;
}

export function deriveOfficialPlacements(input: {
  completionPath: "round_robin" | "final_stage";
  standings: readonly { playerId: string }[];
  fixtures: readonly Fixture[];
  matches: readonly Match[];
  sets: readonly SetRow[];
}): OfficialPlacement[] {
  const approved = input.matches.filter((match) => match.status === "approved" && match.fixture_id);
  const byFixture = new Map(approved.map((match) => [match.fixture_id, match]));
  let playerIds: string[];
  if (input.completionPath === "round_robin") {
    playerIds = input.standings.map((standing) => standing.playerId);
  } else {
    const final = input.fixtures.find((fixture) => fixture.stage === "final");
    const playoff = input.fixtures.find((fixture) => fixture.stage === "playoff");
    const finalMatch = final ? byFixture.get(final.id) : null;
    const playoffMatch = playoff ? byFixture.get(playoff.id) : null;
    if (!finalMatch?.winner_id) throw new Error("The final result is required.");
    const podium = [
      finalMatch.winner_id,
      finalMatch.winner_id === finalMatch.player1_id ? finalMatch.player2_id : finalMatch.player1_id,
    ];
    if(playoffMatch?.winner_id) podium.push(playoffMatch.winner_id,playoffMatch.winner_id === playoffMatch.player1_id ? playoffMatch.player2_id : playoffMatch.player1_id);
    playerIds = [...podium, ...input.standings.map((standing) => standing.playerId).filter((playerId) => !podium.includes(playerId))];
  }
  if (playerIds.length < 2 || playerIds.length > 8 || new Set(playerIds).size !== playerIds.length) throw new Error("Two to eight unique placements are required.");
  const setsByMatch=new Map<string,SetRow[]>();for(const set of input.sets){const rows=setsByMatch.get(set.match_id)??[];rows.push(set);setsByMatch.set(set.match_id,rows)}
  const chronological = approved.slice().sort((a, b) => a.played_at.localeCompare(b.played_at) || a.id.localeCompare(b.id));
  return playerIds.map((playerId, index) => {
    const placement = (index + 1) as Placement;
    return {
      playerId,
      placement,
      points: PLACEMENT_POINTS[placement],
      matches: chronological.flatMap((match) => {
        if (match.player1_id !== playerId && match.player2_id !== playerId) return [];
        const sets = (setsByMatch.get(match.id)??[]).sort((a,b)=>(a.set_number??0)-(b.set_number??0));
        if (!sets.length) return [];
        return [{
          opponentId: match.player1_id === playerId ? match.player2_id : match.player1_id,
          score: sets.map((set)=>scoreForPlayer(match, set, playerId)).join(" "),
          won: match.winner_id === playerId,
        }];
      }),
    };
  });
}
