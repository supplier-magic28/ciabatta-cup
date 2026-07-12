import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TournamentBoard } from "@/components/tournament/TournamentBoard";
import { TournamentPhotoControl } from "@/components/tournament/TournamentPhotoControl";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadTournamentBoard } from "@/lib/tournament/read";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";

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
      <BackLink href={PARENT_ROUTES.cups} className="mb-5">All cups</BackLink>
      <section className="mb-8 border-2 border-ink bg-green p-5 text-cream shadow-[4px_4px_0_var(--color-ink)] sm:p-7">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] sm:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-green-muted">{tournament.status} · Ranked Elo</p>
            <h1 className="mt-1 font-heading text-3xl font-bold">{tournament.name}</h1>
            <p className="mt-3 font-mono text-[11px] uppercase leading-5 text-green-muted">
              {new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: tournament.timezone }).format(new Date(tournament.starts_at))}<br />
              {tournament.location_name} · {tournament.courts} courts
            </p>
            {player.role === "admin" && <Link href={`/admin/tournaments/${tournament.id}`} className="mt-5 inline-block border-2 border-cream px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[1px]">Admin view</Link>}
          </div>
          <TournamentPhotoControl tournamentId={tournament.id} photoUrl={tournament.cover_image_url} canEdit={player.role === "admin"} />
        </div>
        {championId && <p className="mt-5 border-t border-green-muted pt-4 font-heading text-xl font-bold text-chartreuse">Champion: {playerById.get(championId)?.name ?? "Winner"}</p>}
      </section>
      <TournamentBoard board={board} />
      <section className="mt-8 border-l-4 border-crust bg-row p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-crust">Format</p>
        <p className="mt-1 font-body text-sm leading-6">Round robin and qualification deciders are first to 3 games. After group play, the director can make the standings final or continue to a full-set final and third-place match. Full sets use a tie-break at 6-6.</p>
      </section>
    </main>
  );
}
