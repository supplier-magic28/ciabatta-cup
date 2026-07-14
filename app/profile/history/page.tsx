import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { displayName } from "@/lib/auth/displayName";
import { getSessionPlayer } from "@/lib/auth/session";
import { deriveH2HSummaries, deriveTournamentHistory, H2H_MIN_GAMES, type NormalizedHistoryMatch } from "@/lib/profile/history";
import { createClient } from "@/lib/supabase/server";

const pill = "rounded-full border-2 border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[1px]";
const ordinal = (value: number | null) => value == null ? "No placement" : `${value}${value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}`;

export default async function ProfileHistoryPage({ searchParams }: { searchParams: Promise<{ view?: string; opponent?: string }> }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const params = await searchParams;
  const view = params.view === "tournaments" ? "tournaments" : "h2h";
  const supabase = await createClient();
  const [playersResult, matchesResult, detailsResult, savedResult, entriesResult, tournamentsResult, participantRowsResult, placementsResult, tournamentMatchesResult] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name, email, nickname, use_nickname"),
    supabase.from("matches").select("id, type, status, played_at, tournament_id, player1_id, player2_id, winner_id, external_won, match_sets(set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)").eq("status", "approved").or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`).order("played_at", { ascending: false }),
    supabase.from("external_match_details").select("match_id, external_opponent_id, opponent_name"),
    supabase.from("external_opponents").select("id, display_name"),
    supabase.from("tournament_participants").select("tournament_id").eq("player_id", player.id),
    supabase.from("tournaments").select("id, name, starts_at, location_name, cover_image_url"),
    supabase.from("tournament_participants").select("tournament_id, player_id"),
    supabase.from("tournament_placements").select("tournament_id, player_id, placement, points").eq("player_id", player.id),
    supabase.from("matches").select("tournament_id, player1_id, player2_id, winner_id, status").eq("status", "approved").not("tournament_id", "is", null),
  ]);
  const playerNames = new Map((playersResult.data ?? []).map((row) => [row.id, displayName({ firstName: row.first_name, lastName: row.last_name, email: row.email, nickname: row.nickname, useNickname: row.use_nickname })]));
  const details = new Map((detailsResult.data ?? []).map((row) => [row.match_id, row]));
  const savedIds = new Set((savedResult.data ?? []).map((row) => row.id));
  const matches: NormalizedHistoryMatch[] = (matchesResult.data ?? []).map((match) => {
    const external = match.type === "unranked_external";
    const detail = details.get(match.id);
    const opponentId = match.player1_id === player.id ? match.player2_id : match.player1_id;
    const firstPerspective = match.player1_id === player.id;
    const sets = (match.match_sets ?? []).slice().sort((a, b) => a.set_number - b.set_number).map((set) => ({ selfGames: firstPerspective ? set.p1_games : set.p2_games, opponentGames: firstPerspective ? set.p2_games : set.p1_games }));
    return {
      id: match.id,
      opponentKey: external ? (detail?.external_opponent_id ? `external:${detail.external_opponent_id}` : null) : (opponentId ? `player:${opponentId}` : null),
      opponentName: external ? (detail?.opponent_name ?? "Non-Ciabatta opponent") : (playerNames.get(opponentId ?? "") ?? "Unknown player"),
      external,
      savedExternal: Boolean(detail?.external_opponent_id && savedIds.has(detail.external_opponent_id)),
      won: match.winner_id === player.id,
      playedAt: match.played_at,
      type: match.type as NormalizedHistoryMatch["type"],
      tournamentId: match.tournament_id,
      sets,
      pointsDelta: match.tournament_id ? null : external || match.type === "exhibition" ? 10 : match.winner_id === player.id ? 30 : 15,
    };
  });
  const summaries = deriveH2HSummaries(matches, [
    ...(playersResult.data ?? []).filter((row) => row.id !== player.id).map((row) => ({ opponentKey: `player:${row.id}`, opponentName: playerNames.get(row.id) ?? "Unknown player", external: false })),
    ...(savedResult.data ?? []).map((row) => ({ opponentKey: `external:${row.id}`, opponentName: row.display_name, external: true })),
  ]);
  const selected = summaries.find((summary) => summary.opponentKey === params.opponent) ?? summaries[0];
  const enteredIds = new Set((entriesResult.data ?? []).map((row) => row.tournament_id));
  const placementByTournament = new Map((placementsResult.data ?? []).map((row) => [row.tournament_id, row]));
  const participantCount = new Map<string, number>();
  for (const row of participantRowsResult.data ?? []) participantCount.set(row.tournament_id, (participantCount.get(row.tournament_id) ?? 0) + 1);
  const tournamentHistory = deriveTournamentHistory(player.id, (tournamentsResult.data ?? []).filter((row) => enteredIds.has(row.id)).map((tournament) => {
    const placement = placementByTournament.get(tournament.id);
    return { id: tournament.id, name: tournament.name, startsAt: tournament.starts_at, locationName: tournament.location_name, coverImageUrl: tournament.cover_image_url, participantCount: participantCount.get(tournament.id) ?? 0, structure: "Round robin", placement: placement?.placement ?? null, points: placement?.points ?? null, matches: (tournamentMatchesResult.data ?? []).filter((match) => match.tournament_id === tournament.id).map((match) => ({ player1Id: match.player1_id, player2Id: match.player2_id!, winnerId: match.winner_id })) };
  }));

  return <section>
    <div className="mb-6 flex gap-2"><Link href="/profile/history?view=h2h" className={`${pill} ${view === "h2h" ? "bg-ink text-chartreuse" : "bg-surface text-muted"}`}>H2H</Link><Link href="/profile/history?view=tournaments" className={`${pill} ${view === "tournaments" ? "bg-ink text-chartreuse" : "bg-surface text-muted"}`}>Tournaments</Link></div>
    {view === "h2h" ? <>
      <div className="mb-5 flex flex-wrap gap-2">{summaries.map((summary) => <Link key={summary.opponentKey} href={`/profile/history?view=h2h&opponent=${encodeURIComponent(summary.opponentKey)}`} className={`${pill} ${summary.external ? "border-dashed border-green" : ""} ${selected?.opponentKey === summary.opponentKey ? "bg-ink text-chartreuse" : "bg-surface text-ink"}`}>{summary.opponentName}{!summary.unlocked ? ` · ${summary.played}/${H2H_MIN_GAMES}` : ""}</Link>)}</div>
      {!selected ? <p className="border-2 border-hairline bg-surface p-6 font-body text-muted">No opponents available yet.</p> : selected.unlocked ? <section className="border-2 border-ink bg-ink p-5 text-cream shadow-[4px_4px_0_var(--color-green)]"><p className="font-mono text-[10px] uppercase tracking-[2px] text-green-muted">Head to head · {selected.opponentName}</p><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><Stat label="Matches" value={`${selected.won}-${selected.lost}`} /><Stat label="Sets" value={`${selected.setsWon}-${selected.setsLost}`} /><Stat label="Games" value={`${selected.gamesWon}-${selected.gamesLost}`} /><Stat label="Last result" value={selected.lastResult ?? "—"} /></div></section> : <section className="border-2 border-dashed border-green bg-surface p-5"><h2 className="font-heading text-xl font-bold text-ink">See more statistics with at least {H2H_MIN_GAMES} H2H games</h2><div className="mt-4 h-3 overflow-hidden border border-ink bg-row"><div className="h-full bg-green" style={{ width: `${(selected.played / H2H_MIN_GAMES) * 100}%` }} /></div><p className="mt-3 font-mono text-xs text-green">{selected.remaining} more to unlock the full head-to-head</p><p className="mt-2 font-body text-sm text-muted">Your results still appear in the complete match list below.</p></section>}
      <section className="mt-8"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">All matches</p><ul className="mt-3 divide-y-2 divide-hairline border-2 border-ink bg-surface">{matches.map((match) => <li key={match.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-heading font-bold text-ink">{match.won ? "W" : "L"} vs {match.opponentName}</p><p className="mt-1 font-mono text-[10px] uppercase text-muted">{new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Melbourne" }).format(new Date(match.playedAt))} · {match.sets.map((set) => `${set.selfGames}-${set.opponentGames}`).join(", ")}</p></div><span className={`font-mono text-sm ${match.pointsDelta != null && match.pointsDelta > 0 ? "text-green" : match.pointsDelta != null && match.pointsDelta < 0 ? "text-rust" : "text-muted"}`}>{match.pointsDelta == null ? "—" : `${match.pointsDelta > 0 ? "+" : ""}${match.pointsDelta}`}</span></li>)}</ul></section>
    </> : <div className="grid gap-5">{tournamentHistory.length === 0 ? <p className="border-2 border-hairline bg-surface p-6 text-muted">No tournament entries yet.</p> : tournamentHistory.map((tournament) => <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="group overflow-hidden border-2 border-ink bg-surface shadow-[4px_4px_0_var(--color-ink)]"><div className="relative h-40 bg-green">{tournament.coverImageUrl ? <Image src={tournament.coverImageUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 800px" /> : <div className="flex h-full items-center justify-center font-heading text-3xl font-bold text-chartreuse">CIABATTA CUP</div>}<span className="absolute right-3 top-3 border-2 border-ink bg-chartreuse px-3 py-1 font-mono text-[10px] font-bold text-ink">{tournament.champion ? "WON" : "ENTERED"}</span></div><div className="p-5"><h2 className="font-heading text-xl font-bold text-ink group-hover:underline">{tournament.name}</h2><p className="mt-2 font-mono text-[10px] uppercase text-muted">{new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Melbourne" }).format(new Date(tournament.startsAt))} · {tournament.structure} · {tournament.participantCount} players · {tournament.locationName}</p><p className="mt-3 font-mono text-sm text-green">{ordinal(tournament.placement)} · {tournament.won}-{tournament.lost} record · {tournament.points ?? 0} points</p></div></Link>)}</div>}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="font-mono text-[9px] uppercase text-green-muted">{label}</p><p className="mt-1 font-mono text-2xl font-bold text-chartreuse">{value}</p></div>;
}
