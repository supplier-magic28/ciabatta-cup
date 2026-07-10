import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { ReignSummary } from "@/components/players/ReignSummary";
import { displayName } from "@/lib/auth/displayName";
import { getSessionPlayer } from "@/lib/auth/session";
import { formatScore } from "@/lib/match/score";
import { indexEmbeddedScoreSets } from "@/lib/match/embeddedSets";
import { derivePlayerProfile, type ProfileMatch } from "@/lib/players/profile";
import { buildRatingCache, type ScoringMatchRow } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

const eyebrow = "font-mono text-[10px] uppercase tracking-[1.5px]";

function recordLabel(record: { won: number; lost: number }): string {
  return `${record.won}-${record.lost}`;
}

function profileVital(label: string, value: string | null) {
  if (!value) return null;
  return (
    <div>
      <p className={`${eyebrow} text-muted`}>{label}</p>
      <p className="mt-1 font-heading text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

/** Player profile (design screen 02), derived entirely from immutable match facts. */
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const sessionPlayer = await getSessionPlayer();
  if (!sessionPlayer) redirect("/sign-in");
  const { playerId } = await params;
  const supabase = await createClient();

  const [{ data: target }, { data: playerRows }, { data: matchRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, email, nickname, avatar_url, height_cm, weight_kg, plays, backhand, game_style, status")
      .eq("id", playerId)
      .single(),
    supabase
      .from("players")
      .select("id, first_name, last_name, email, avatar_url, status")
      .order("first_name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, type, status, played_at, match_sets(set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
      .eq("status", "approved"),
  ]);

  if (!target) notFound();
  const setsByMatch = indexEmbeddedScoreSets(matchRows ?? []);

  const players = (playerRows ?? []).map((player) => ({
    ...player,
    name: displayName({ firstName: player.first_name, lastName: player.last_name, email: player.email }),
  }));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const matches: ProfileMatch[] = (matchRows ?? []).map((match) => ({
    id: match.id,
    player1Id: match.player1_id,
    player2Id: match.player2_id,
    winnerId: match.winner_id,
    type: match.type,
    status: match.status,
    playedAt: match.played_at,
    sets: setsByMatch.get(match.id) ?? [],
  }));
  const name = displayName({
    firstName: target.first_name,
    lastName: target.last_name,
    email: target.email,
  });
  const profile = derivePlayerProfile(playerId, matches);
  const cache = buildRatingCache(
    players.map((player) => player.id),
    (matchRows ?? []) as ScoringMatchRow[],
  );
  const standing = cache.rankings.find((ranking) => ranking.playerId === playerId);
  const reigns = cache.reigns.filter((reign) => reign.playerId === playerId);
  const currentReign = reigns.find((reign) => reign.endedAt === null);
  const points = profile.pointsTrend.map((entry) => entry.points);
  const minPoints = Math.min(...points, standing?.rating ?? 0);
  const maxPoints = Math.max(...points, standing?.rating ?? 0);
  const pointRange = Math.max(1, maxPoints - minPoints);
  const vitals = [
    profileVital("Height", target.height_cm ? `${target.height_cm} cm` : null),
    profileVital("Weight", target.weight_kg ? `${target.weight_kg} kg` : null),
    profileVital("Plays", target.plays ? `${target.plays} handed` : null),
    profileVital("Backhand", target.backhand ? target.backhand.replace("_", " ") : null),
  ].filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-5 flex items-center justify-between border-b-2 border-ink pb-4">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[1.5px] text-green">
          Board
        </Link>
        <Link href="/matches" className="font-mono text-[11px] uppercase tracking-[1.5px] text-muted">
          Matches
        </Link>
      </header>

      <section className="border-2 border-ink bg-ink p-5 shadow-[4px_4px_0_var(--color-green)] sm:p-7">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-center gap-4">
            <PlayerAvatar name={name} avatarUrl={target.avatar_url} size={88} className="bg-crust text-crumb" />
            <div className="min-w-0">
              <p className={`${eyebrow} text-green-muted`}>Player profile</p>
              <h1 className="mt-1 truncate font-heading text-3xl font-bold text-cream">{name}</h1>
              {target.nickname && <p className="mt-1 font-body text-sm italic text-green-muted">&quot;{target.nickname}&quot;</p>}
              {target.game_style && <p className="mt-3 font-mono text-[11px] uppercase tracking-[1px] text-chartreuse">{target.game_style}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:text-right">
            <div>
              <p className={`${eyebrow} text-green-muted`}>Rank</p>
              <p className="font-mono text-2xl font-semibold text-chartreuse">
                {standing && standing.played > 0 ? `#${standing.rank}` : "--"}
              </p>
            </div>
            <div>
              <p className={`${eyebrow} text-green-muted`}>Points</p>
              <p className="font-mono text-2xl font-semibold text-chartreuse">{standing?.rating ?? 0}</p>
            </div>
            {currentReign && (
              <ReignSummary startedAt={currentReign.startedAt} reignNumber={reigns.length} />
            )}
          </div>
        </div>
      </section>

      {vitals.length > 0 && <section className="grid grid-cols-2 gap-4 border-x-2 border-b-2 border-ink bg-surface p-5 sm:grid-cols-4">{vitals}</section>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { label: "Ranked", record: profile.ranked, tone: "border-green bg-green text-cream" },
          { label: "Exhibition", record: profile.exhibition, tone: "border-ink bg-surface text-ink" },
        ].map(({ label, record, tone }) => (
          <div key={label} className={`border-2 p-5 shadow-[3px_3px_0_var(--color-ink)] ${tone}`}>
            <p className={`${eyebrow} ${label === "Ranked" ? "text-green-muted" : "text-muted"}`}>{label} record</p>
            <p className="mt-2 font-mono text-3xl font-semibold">{recordLabel(record)}</p>
            <p className={`mt-1 font-body text-sm ${label === "Ranked" ? "text-cream" : "text-muted"}`}>{record.played} approved matches</p>
          </div>
        ))}
      </section>

      <section className="mt-8 border-t-2 border-ink pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-heading text-xl font-bold text-ink">Points history</h2>
          <p className="font-mono text-[11px] text-muted">{standing?.rating ?? 0} current</p>
        </div>
        {profile.pointsTrend.length === 0 ? (
          <p className="mt-3 font-body text-sm text-muted">No ranked results yet.</p>
        ) : (
          <div className="mt-4 flex h-28 items-end gap-2 border-b-2 border-ink pb-1">
            {profile.pointsTrend.map((entry) => (
              <div key={entry.playedAt} className="flex flex-1 flex-col justify-end" title={`${entry.points} points`}>
                <div
                  className="min-h-2 bg-green"
                  style={{ height: `${18 + ((entry.points - minPoints) / pointRange) * 82}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="border-b-2 border-ink pb-3 font-heading text-xl font-bold text-ink">Head to head</h2>
          {profile.headToHead.length === 0 ? (
            <p className="mt-3 font-body text-sm text-muted">No approved opponents yet.</p>
          ) : (
            <ul className="divide-y-2 divide-hairline">
              {profile.headToHead.map((record) => {
                const opponent = playerById.get(record.opponentId);
                return (
                  <li key={record.opponentId} className="flex items-center justify-between gap-4 py-3">
                    <Link href={`/players/${record.opponentId}`} className="font-heading text-base font-bold text-ink underline decoration-green decoration-2 underline-offset-4">
                      {opponent?.name ?? "Unknown player"}
                    </Link>
                    <span className="font-mono text-sm text-ink">{recordLabel(record)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h2 className="border-b-2 border-ink pb-3 font-heading text-xl font-bold text-ink">Match log</h2>
          {profile.matchLog.length === 0 ? (
            <p className="mt-3 font-body text-sm text-muted">No approved matches yet.</p>
          ) : (
            <ul className="divide-y-2 divide-hairline">
              {profile.matchLog.slice(0, 10).map((match) => {
                const opponent = playerById.get(match.opponentId);
                return (
                  <li key={match.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <Link href={`/players/${match.opponentId}`} className="font-heading text-base font-bold text-ink underline decoration-green decoration-2 underline-offset-4">
                        vs {opponent?.name ?? "Unknown player"}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-muted">{formatScore(match.sets)}</p>
                    </div>
                    <span className={`font-mono text-[10px] uppercase tracking-[1px] ${match.won ? "text-green" : "text-rust"}`}>
                      {match.won ? "Win" : "Loss"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
