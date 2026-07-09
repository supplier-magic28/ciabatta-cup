import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { displayName } from "@/lib/auth/displayName";
import { Button } from "@/components/ui/Button";

/**
 * Placeholder authenticated landing. Middleware already gates this route; the
 * guard here is belt-and-braces. No real screens yet — just proof of session.
 */
export default async function Home() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const name = displayName({
    firstName: player.firstName,
    lastName: player.lastName,
    email: player.email,
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[2px] text-muted">
        Logged in as
      </p>
      <h1 className="font-heading text-4xl font-bold tracking-tight text-ink">
        {name}
      </h1>
      <form action={signOut} className="w-full max-w-[200px]">
        <Button type="submit">Log out</Button>
      </form>
    </main>
  );
}
