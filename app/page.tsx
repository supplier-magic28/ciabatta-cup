import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { displayName } from "@/lib/auth/displayName";
import { buildRatingCache, type ScoringMatchRow, type TournamentPlacementRow } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { LoafBadge } from "@/components/brand/LoafBadge";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { ReignSummary } from "@/components/players/ReignSummary";

function movementLabel(change: number): { label: string; color: string } {
  if (change > 0) return { label: `UP ${change}`, color: "text-green" };
  if (change < 0) return { label: `DOWN ${Math.abs(change)}`, color: "text-rust" };
  return { label: "--", color: "text-muted" };
}

/**
 * The real board (design screen 01). It reads match facts and derives the
 * standings with the same pure adapter used to materialise the database cache.
 */
export default async function Home() {
  const sessionPlayer = await getSessionPlayer();
  if (!sessionPlayer) redirect("/sign-in");

  const supabase = await createClient();
  const [{ data: playerRows }, { data: matchRows }, { data: placementRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, email, nickname, use_nickname, avatar_url, status")
      .order("first_name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, type, status, played_at, tournament_id"),
    supabase.from("tournament_placements").select("player_id, points, awarded_at"),
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
  const latestHistory = new Map<string, (typeof cache.ratingHistory)[number]>();
  for (const entry of cache.ratingHistory) latestHistory.set(entry.playerId, entry);

  const currentReign = cache.reigns.find((reign) => reign.endedAt === null);
  const holderName = currentReign
    ? playerById.get(currentReign.playerId)?.name ?? "Current holder"
    : "No holder yet";

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
        <ol className="flex flex-col gap-3">
          {standings.map((standing) => {
            const player = playerById.get(standing.playerId);
            const name = player?.name ?? "Unknown player";
            const history = latestHistory.get(standing.playerId);
            const movement = movementLabel(history ? history.rankBefore - history.rankAfter : 0);
            const isHolder = currentReign?.playerId === standing.playerId;
            const displayRank = standing.rating > 0 ? standing.rank : "--";

            return (
              <li
                key={standing.playerId}
                className={
                  isHolder
                    ? "border-2 border-ink bg-ink p-4 shadow-[4px_4px_0_var(--color-green)]"
                    : "border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]"
                }
              >
                <div className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 sm:grid-cols-[3rem_1fr_auto_auto] sm:gap-5">
                  <span className={`font-heading text-2xl font-bold ${isHolder ? "text-chartreuse" : "text-ink"}`}>
                    {displayRank}
                  </span>
                  <Link href={`/players/${standing.playerId}`} className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar
                      name={name}
                      avatarUrl={player?.avatar_url ?? null}
                      size={40}
                      className={isHolder ? "bg-crust text-crumb" : undefined}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`truncate font-heading text-base font-bold ${isHolder ? "text-cream" : "text-ink"}`}>
                          {name}
                        </p>
                        {isHolder && <LoafBadge size={25} />}
                      </div>
                      <p className={`font-mono text-[11px] ${isHolder ? "text-green-muted" : "text-muted"}`}>
                        {standing.won}-{standing.lost} ranked record
                      </p>
                    </div>
                  </Link>
                  <span className={`hidden font-mono text-[10px] uppercase tracking-[1px] sm:block ${isHolder ? "text-green-muted" : movement.color}`}>
                    {movement.label}
                  </span>
                  <div className="text-right">
                    <p className={`font-mono text-xl font-semibold ${isHolder ? "text-chartreuse" : "text-ink"}`}>
                      {standing.rating}
                    </p>
                    <p className={`font-mono text-[9px] uppercase tracking-[1.5px] ${isHolder ? "text-green-muted" : "text-muted"}`}>
                      points
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
