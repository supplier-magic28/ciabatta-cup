import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth/displayName";
import { InvitePlayerForm } from "@/components/players/InvitePlayerForm";
import { DeletePlayerButton } from "@/components/players/DeletePlayerButton";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";
import { WorkflowZeusInboxAction } from "@/components/notifications/ZeusInboxButton";
import { loadCourtOptions } from "@/lib/courts/read";
import { CourtMergeForm } from "@/components/courts/CourtMergeForm";

const eyebrow = "font-mono text-[10px] uppercase tracking-[2px] text-muted";

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  inactive: "Inactive",
};

const STATUS_COLOR: Record<string, string> = {
  invited: "text-crust",
  active: "text-green",
  inactive: "text-muted",
};

function metaLine(status: string, invitedAt: string | null, joinedAt: string | null): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (status === "invited") return invitedAt ? `Invite sent ${fmt(invitedAt)}` : "Invite pending";
  if (joinedAt) return `Joined ${fmt(joinedAt)}`;
  return "";
}

/**
 * Manage players (design screen 08). Admin-only: the roster with each player's
 * status, safe deletion, and the invite form. Edit/deactivate/resend remain a
 * later admin phase. Admin gating: the route guard here plus the players table's
 * is_admin() RLS and server-action authorization (ADR-0009, ADR-0015).
 */
export default async function ManagePlayersPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  if (player.role !== "admin") redirect("/");

  const supabase = await createClient();
  const [{ data }, courts] = await Promise.all([supabase
    .from("players")
    .select("id, first_name, last_name, email, nickname, use_nickname, role, status, invited_at, joined_at")
    .order("status", { ascending: true })
    .order("first_name", { ascending: true }), loadCourtOptions()]);

  const players = data ?? [];

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <WorkflowZeusInboxAction />
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Players</h1>
        <BackLink href={PARENT_ROUTES.ladder}>Ladder</BackLink>
      </header>

      <ul className="mb-8 flex flex-col gap-3">
        {players.map((p) => (
          <li
            key={p.id}
            className="rounded-[8px] border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-heading text-base font-bold text-ink">
                {displayName({ firstName: p.first_name, lastName: p.last_name, email: p.email, nickname: p.nickname, useNickname: p.use_nickname })}
                {p.role === "admin" && (
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[1.5px] text-crust">
                    Admin
                  </span>
                )}
              </span>
              <span
                className={
                  "font-mono text-[10px] uppercase tracking-[1.5px] " +
                  (STATUS_COLOR[p.status] ?? "text-muted")
                }
              >
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </div>
            <p className="mt-1 font-body text-[13px] text-muted">{p.email}</p>
            <p className={`${eyebrow} mt-1`}>{metaLine(p.status, p.invited_at, p.joined_at)}</p>
            {p.id !== player.id && (
              <DeletePlayerButton
                playerId={p.id}
                playerName={displayName({
                  firstName: p.first_name,
                  lastName: p.last_name,
                  email: p.email,
                  nickname: p.nickname,
                  useNickname: p.use_nickname,
                })}
              />
            )}
          </li>
        ))}
      </ul>

      <section className="rounded-[8px] border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
        <p className={`${eyebrow} mb-3`}>Invite a player</p>
        <InvitePlayerForm />
      </section>
      <section className="mt-8 rounded-[8px] border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-crust)]"><p className={`${eyebrow} mb-1`}>Court aliases</p><h2 className="font-heading text-xl font-bold">Merge duplicate courts</h2><p className="mt-2 font-body text-sm text-muted">Matches move to the canonical court. The old name remains an alias.</p><CourtMergeForm courts={courts}/></section>
    </main>
  );
}
