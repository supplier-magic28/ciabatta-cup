import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { Wordmark } from "@/components/brand/Wordmark";
import { ZeusInboxAction } from "@/components/notifications/ZeusInboxButton";

export function SiteHeader({ role, active }: { role: "player" | "admin"; active?: "leaderboard" | "tournaments" | "profile" | "points" | "zeus" }) {
  const linkClass = "font-mono text-[10px] uppercase tracking-[1.5px]";
  return (
    <header className="mb-7 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b-2 border-ink pb-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <Link href="/" aria-label="Ciabatta Cup leaderboard">
        <Wordmark className="origin-left scale-[0.72] sm:scale-90" />
      </Link>
      <nav aria-label="Primary" className="order-3 col-span-2 flex flex-wrap justify-end gap-x-4 gap-y-2 pt-1 sm:order-none sm:col-span-1 sm:pt-0">
        <Link href="/" className={`${linkClass} ${active === "leaderboard" ? "text-ink underline decoration-green decoration-2 underline-offset-4" : "text-ink"}`}>
          Ladder
        </Link>
        <Link href="/points" className={`${linkClass} ${active === "points" ? "text-ink underline decoration-green decoration-2 underline-offset-4" : "text-green"}`}>Points</Link>
        <Link href="/tournaments" className={`${linkClass} ${active === "tournaments" ? "text-ink underline decoration-green decoration-2 underline-offset-4" : "text-green"}`}>
          Cups
        </Link>
        <Link href="/matches" className={`${linkClass} text-ink`}>Matches</Link>
        <Link href="/matches/new" className={`${linkClass} text-green`}>Log result</Link>
        {role === "admin" && (
          <>
            <Link href="/admin/approvals" className={`${linkClass} text-crust`}>Approvals</Link>
            <Link href="/admin/players" className={`${linkClass} text-crust`}>Players</Link>
          </>
        )}
        <Link href="/profile" className={`${linkClass} ${active === "profile" ? "text-ink underline decoration-green decoration-2 underline-offset-4" : "text-green"}`}>Profile</Link>
        <form action={signOut}>
          <button type="submit" className={`${linkClass} text-muted underline underline-offset-4`}>Log out</button>
        </form>
      </nav>
      <div className="justify-self-end">
        <ZeusInboxAction active={active === "zeus"} />
      </div>
    </header>
  );
}
