import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { displayName } from "@/lib/auth/displayName";
import { buildRatingCache, type ScoringMatchRow, type TournamentPlacementRow } from "@/lib/scoring";
import {
  deriveLeaderboardHistory,
  type LeaderboardFixtureRow,
  type LeaderboardMatchRow,
  type LeaderboardPlacementRow,
  type LeaderboardTournamentRow,
} from "@/lib/leaderboard/history";
import { createClient } from "@/lib/supabase/server";
import { LoafBadge } from "@/components/brand/LoafBadge";
import { ExpandableLeaderboard, type LeaderboardPlayer } from "@/components/leaderboard/ExpandableLeaderboard";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ReignSummary } from "@/components/players/ReignSummary";

/**
 * The real board (design screen 01). It reads match facts and derives the
 * standings with the same pure adapter used to materialise the database cache.
 */
export default async function Home() {
  const sessionPlayer = await getSessionPlayer();
  if (!sessionPlayer) redirect("/sign-in");

  const supabase = await createClient();
  const [
    { data: playerRows },
    { data: matchRows },
    { data: placementRows },
    { data: tournamentRows },
    { data: fixtureRows },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, email, nickname, use_nickname, avatar_url, status")
      .order("first_name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, type, status, played_at, tournament_id, fixture_id, match_sets(p1_games, p2_games)"),
    supabase.from("tournament_placements").select("tournament_id, player_id, placement, points, awarded_at"),
    supabase.from("tournaments").select("id, counts_as"),
    supabase.from("fixtures").select("id, ruleset"),
  ]);

  const players = (playerRows ?? []).map((player) => ({
    ...player,
    name: displayName({
      firstName: player.first_name,
      lastName: player.last_name,
      email: player.email,
      nickname: player.nickname,
      useNickname: player.use_nickname,
    }),
  }));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const activePlayerIds = new Set(players.filter((player) => player.status === "active").map((p) => p.id));
  const cache = buildRatingCache(
    players.map((player) => player.id),
    (matchRows ?? []) as ScoringMatchRow[],
    (placementRows ?? []) as TournamentPlacementRow[],
  );
  const standings = cache.rankings
    .filter((ranking) => activePlayerIds.has(ranking.playerId))
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  const histories = deriveLeaderboardHistory(
    players.map((player) => player.id),
    (matchRows ?? []) as LeaderboardMatchRow[],
    (placementRows ?? []) as LeaderboardPlacementRow[],
    (tournamentRows ?? []) as LeaderboardTournamentRow[],
    (fixtureRows ?? []) as LeaderboardFixtureRow[],
  );

  const currentReign = cache.reigns.find((reign) => reign.endedAt === null);
  const holderName = currentReign
    ? playerById.get(currentReign.playerId)?.name ?? "Current holder"
    : "No holder yet";
  const leaderboardPlayers: LeaderboardPlayer[] = standings.map((standing) => {
    const player = playerById.get(standing.playerId);
    return {
      playerId: standing.playerId,
      name: player?.name ?? "Unknown player",
      avatarUrl: player?.avatar_url ?? null,
      rank: standing.rank,
      rating: standing.rating,
      isHolder: currentReign?.playerId === standing.playerId,
      history: histories.get(standing.playerId) ?? {
        trophies: 0,
        rankedMatches: { won: 0, lost: 0 },
        rankedSets: { won: 0, lost: 0 },
        tournamentMatches: { won: 0, lost: 0 },
      },
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6">
      <SiteHeader role={sessionPlayer.role} active="leaderboard" />

      <section className="mb-6 border-2 border-ink bg-green px-4 py-3 shadow-[3px_3px_0_var(--color-ink)]">
        <div className="flex items-center gap-3">
          <LoafBadge size={34} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-green-muted">The Ciabatta</p>
            <p className="font-heading text-lg font-bold text-cream">Held by {holderName}</p>
            {currentReign && <ReignSummary startedAt={currentReign.startedAt} reignNumber={cache.reigns.length} />}
          </div>
        </div>
      </section>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">All-time ladder</p>
          <h1 className="font-heading text-3xl font-bold text-ink">Leaderboard</h1>
        </div>
        <p className="font-mono text-[11px] text-muted">Ladder points</p>
      </div>

      {standings.length === 0 ? (
        <section className="border-2 border-hairline bg-surface px-5 py-8 text-center">
          <p className="font-heading text-lg font-bold text-ink">The ladder is waiting.</p>
          <p className="mt-1 font-body text-sm text-muted">Invite the players, then log the first ranked result.</p>
        </section>
      ) : (
        <ExpandableLeaderboard players={leaderboardPlayers} />
      )}
    </main>
  );
}
