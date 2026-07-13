import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth/displayName";
import { LogMatchForm, type OpponentOption } from "@/components/match/LogMatchForm";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";

/**
 * Log-match screen (design screen 03). Server component: gates the session,
 * loads the opponent list, and hands off to the client wizard. The proxy already
 * protects `/matches`; the guard here is belt-and-braces.
 */
export default async function NewMatchPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const supabase = await createClient();
  const [{ data }, { data: savedExternalRows }] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name, email, nickname, use_nickname, status").order("first_name", { ascending: true }),
    supabase.from("external_opponents").select("id, display_name").order("display_name", { ascending: true }),
  ]);

  const rows = data ?? [];
  const opponents: OpponentOption[] = rows
    .filter((p) => p.id !== player.id && p.status !== "inactive")
    .map((p) => ({
      id: p.id,
      name: displayName({ firstName: p.first_name, lastName: p.last_name, email: p.email, nickname: p.nickname, useNickname: p.use_nickname }),
    }));

  const self = rows.find((p) => p.id === player.id);
  const selfName = displayName({
    firstName: self?.first_name ?? player.firstName,
    lastName: self?.last_name ?? player.lastName,
    email: self?.email ?? player.email,
    nickname: self?.nickname,
    useNickname: self?.use_nickname,
  });
  const requestedType = (await searchParams).type;
  const initialType = requestedType === "ranked" || requestedType === "exhibition" ? requestedType : undefined;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <BackLink href={PARENT_ROUTES.matches} className="mb-5">Your matches</BackLink>
      <LogMatchForm initialType={initialType} selfName={selfName} opponents={opponents} savedExternalOpponents={(savedExternalRows ?? []).map((row) => ({ id: row.id, name: row.display_name }))} />
    </main>
  );
}
