import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth/displayName";
import { LogMatchForm, type OpponentOption } from "@/components/match/LogMatchForm";

/**
 * Log-match screen (design screen 03). Server component: gates the session,
 * loads the opponent list, and hands off to the client wizard. The proxy already
 * protects `/matches`; the guard here is belt-and-braces.
 */
export default async function NewMatchPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const supabase = await createClient();
  const { data } = await supabase
    .from("players")
    .select("id, first_name, last_name, email, status")
    .neq("id", player.id)
    .order("first_name", { ascending: true });

  const opponents: OpponentOption[] = (data ?? [])
    .filter((p) => p.status !== "inactive")
    .map((p) => ({
      id: p.id,
      name: displayName({ firstName: p.first_name, lastName: p.last_name, email: p.email }),
    }));

  const selfName = displayName({
    firstName: player.firstName,
    lastName: player.lastName,
    email: player.email,
  });

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <LogMatchForm selfName={selfName} opponents={opponents} />
    </main>
  );
}
