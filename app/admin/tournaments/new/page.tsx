import Link from "next/link";
import { redirect } from "next/navigation";
import { NewTournamentForm } from "@/components/tournament/NewTournamentForm";
import { displayName } from "@/lib/auth/displayName";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function NewTournamentPage() {
  const admin = await getSessionPlayer();
  if (!admin) redirect("/sign-in");
  if (admin.role !== "admin") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("players").select("id, first_name, last_name, email").eq("status", "active").order("first_name");
  const players = (data ?? []).map((player) => ({ id: player.id, name: displayName({ firstName: player.first_name, lastName: player.last_name, email: player.email }) }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:px-6">
      <header className="mb-7 flex items-start justify-between border-b-2 border-ink pb-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Tournament director</p><h1 className="font-heading text-3xl font-bold">New tournament</h1></div>
        <Link href="/tournaments" className="font-mono text-[11px] uppercase text-muted">Back to cups</Link>
      </header>
      <section className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)] sm:p-7">
        <NewTournamentForm players={players} />
      </section>
    </main>
  );
}
