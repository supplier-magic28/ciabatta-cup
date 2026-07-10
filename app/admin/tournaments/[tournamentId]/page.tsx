import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TournamentAdminActions } from "@/components/tournament/TournamentAdminActions";
import { TournamentBoard } from "@/components/tournament/TournamentBoard";
import { TournamentParticipantEditor } from "@/components/tournament/TournamentParticipantEditor";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadActiveTournamentPlayers, loadTournamentBoard } from "@/lib/tournament/read";

export default async function ManageTournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const admin = await getSessionPlayer();
  if (!admin) redirect("/sign-in");
  if (admin.role !== "admin") redirect("/");
  const { tournamentId } = await params;
  const [board, activePlayers] = await Promise.all([
    loadTournamentBoard(tournamentId),
    loadActiveTournamentPlayers(),
  ]);
  if (!board) notFound();
  const canGenerate = board.fixtures.length === 0;
  const canEditParticipants = board.completedResults === 0
    && (board.tournament.status === "draft" || board.tournament.status === "scheduled");
  const participants = board.participants.map((participant) => ({
    id: participant.player_id,
    seed: participant.seed,
    name: board.playerById.get(participant.player_id)?.name ?? "Player",
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Director console · {board.tournament.status}</p>
          <h1 className="font-heading text-3xl font-bold">{board.tournament.name}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted">Scores are approved immediately and cannot be edited.</p>
        </div>
        <div className="flex gap-4 font-mono text-[10px] uppercase text-muted">
          <Link href={`/tournaments/${tournamentId}`}>Player view</Link>
          <Link href="/tournaments">All cups</Link>
        </div>
      </header>

      <section className="mb-7 grid gap-4 border-2 border-ink bg-row p-4 sm:grid-cols-[1fr_280px] sm:items-center">
        <div>
          <p className="font-heading text-lg font-bold">{board.participants.length} players · {board.tournament.courts} courts</p>
          <p className="mt-1 font-mono text-[10px] uppercase leading-5 text-muted">
            {board.participants.map((participant) => `${participant.seed}. ${board.playerById.get(participant.player_id)?.name ?? "Player"}`).join(" · ")}
          </p>
        </div>
        {board.tournament.status !== "completed" && <TournamentAdminActions tournamentId={tournamentId} canGenerate={canGenerate} />}
      </section>

      {canEditParticipants && (
        <TournamentParticipantEditor
          tournamentId={tournamentId}
          participants={participants}
          activePlayers={activePlayers}
        />
      )}

      {canGenerate ? (
        <div className="border-2 border-dashed border-muted bg-surface p-10 text-center">
          <p className="font-heading text-lg font-bold">Ready to make the draw</p>
          <p className="mt-2 font-body text-sm text-muted">Generation locks the seed order into three rounds across both courts.</p>
        </div>
      ) : <TournamentBoard board={board} admin />}
    </main>
  );
}
