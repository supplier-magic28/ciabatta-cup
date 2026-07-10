import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  draft: "text-muted",
  scheduled: "text-crust",
  live: "text-green",
  completed: "text-ink",
  cancelled: "text-rust",
};

export default async function TournamentsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("id, name, status, starts_at, timezone, location_name, courts").order("starts_at", { ascending: false });
  const tournaments = data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-5 sm:px-6">
      <SiteHeader role={player.role} active="tournaments" />
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Competition calendar</p>
          <h1 className="font-heading text-3xl font-bold">Tournaments</h1>
        </div>
        {player.role === "admin" && (
          <Link href="/admin/tournaments/new" className="rounded-[6px] border-2 border-ink bg-crust px-4 py-2 font-heading text-sm font-bold text-cream shadow-[2px_2px_0_var(--color-ink)]">New cup</Link>
        )}
      </div>
      {tournaments.length === 0 ? (
        <div className="border-2 border-hairline bg-surface p-8 text-center font-body text-muted">No tournaments scheduled yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tournaments.map((tournament) => (
            <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-heading text-xl font-bold">{tournament.name}</h2>
                <span className={`font-mono text-[9px] uppercase tracking-[1.5px] ${STATUS_STYLE[tournament.status] ?? "text-muted"}`}>{tournament.status}</span>
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase leading-5 text-muted">
                {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: tournament.timezone }).format(new Date(tournament.starts_at))}<br />
                {tournament.location_name} · {tournament.courts} courts
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
