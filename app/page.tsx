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
import { dateKeyInZone } from "@/lib/profile/streak";

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
    { data: practiceRows },
    { data: playDayRows },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, email, nickname, use_nickname, avatar_url, status")
      .order("first_name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, external_won, type, status, played_at, location, tournament_id, fixture_id, match_sets(p1_games, p2_games)"),
    supabase.from("tournament_placements").select("tournament_id, player_id, placement, points, awarded_at"),
    supabase.from("tournaments").select("id, counts_as"),
    supabase.from("fixtures").select("id, ruleset"),
    supabase.from("practice_sessions").select("id, player_id, practiced_on, status"),
    supabase.from("play_days").select("player_id, played_on"),
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
    practiceRows ?? [],
    playDayRows ?? [],
    dateKeyInZone(new Date()),
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
        externalMatches: { won: 0, lost: 0 },
      },
    };
  });
  const recentMatches = (matchRows ?? []).filter((match) => match.status === "approved").slice().sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, 8);

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

      {recentMatches.length > 0 && <section className="mt-10"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Recent match feed</p><h2 className="mb-3 font-heading text-2xl font-bold text-ink">Fresh from the court</h2><ul className="divide-y-2 divide-hairline border-2 border-ink bg-surface">{recentMatches.map((match) => {
        const first = playerById.get(match.player1_id)?.name ?? "Unknown player";
        const second = match.player2_id ? (playerById.get(match.player2_id)?.name ?? "Unknown player") : "Non-Ciabatta opponent";
        const firstWon = match.type === "unranked_external" ? !match.external_won : match.winner_id === match.player1_id;
        const score = (match.match_sets ?? []).map((set) => `${set.p1_games}-${set.p2_games}`).join(", ");
        return <li key={match.id} className={`p-4 ${match.type === "unranked_external" ? "border-l-4 border-dashed border-green" : ""}`}><p className="font-heading font-bold text-ink">{firstWon ? `${first} d. ${second}` : `${second} d. ${first}`} <span className="font-mono text-sm font-normal">{score}</span></p><p className="mt-1 font-mono text-[9px] uppercase tracking-[1px] text-muted">{match.type === "unranked_external" ? "Non-Ciabatta · Unranked · No ladder movement · +10" : match.type} · {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(match.played_at))}{match.location ? ` · ${match.location}` : ""}</p></li>;
      })}</ul></section>}
    </main>
  );
}
