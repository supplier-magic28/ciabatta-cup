import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TournamentBoard } from "@/components/tournament/TournamentBoard";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadTournamentBoard } from "@/lib/tournament/read";

export default async function TournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const { tournamentId } = await params;
  const board = await loadTournamentBoard(tournamentId);
  if (!board) notFound();
  const { tournament, championId, playerById } = board;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-5 sm:px-6">
      <SiteHeader role={player.role} active="tournaments" />
      <section className="mb-8 border-2 border-ink bg-green p-5 text-cream shadow-[4px_4px_0_var(--color-ink)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-green-muted">{tournament.status} · Ranked Elo</p>
            <h1 className="mt-1 font-heading text-3xl font-bold">{tournament.name}</h1>
            <p className="mt-3 font-mono text-[11px] uppercase leading-5 text-green-muted">
              {new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: tournament.timezone }).format(new Date(tournament.starts_at))}<br />
              {tournament.location_name} · {tournament.courts} courts
            </p>
          </div>
          {player.role === "admin" && <Link href={`/admin/tournaments/${tournament.id}`} className="border-2 border-cream px-3 py-2 font-mono text-[10px] uppercase tracking-[1px]">Director view</Link>}
        </div>
        {championId && <p className="mt-5 border-t border-green-muted pt-4 font-heading text-xl font-bold text-chartreuse">Champion: {playerById.get(championId)?.name ?? "Winner"}</p>}
      </section>
      <TournamentBoard board={board} />
      <section className="mt-8 border-l-4 border-crust bg-row p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-crust">Format</p>
        <p className="mt-1 font-body text-sm leading-6">Round robin and qualification deciders are first to 3 games. The top two play a full-set final; the bottom two play a full set for third. Full sets use a tie-break at 6-6.</p>
      </section>
    </main>
  );
}
