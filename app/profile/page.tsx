import { redirect } from "next/navigation";
import { ProfileSettingsForm } from "@/components/profile/ProfileSettingsForm";
import { displayName } from "@/lib/auth/displayName";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { markNotificationsRead } from "@/lib/planned/actions";

export default async function ProfileSettingsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const supabase = await createClient();
  const [{ data: profile }, { data: notifications }] = await Promise.all([supabase
    .from("players")
    .select("id, first_name, last_name, email, nickname, use_nickname, avatar_url")
    .eq("id", player.id)
    .single(), supabase.from("notifications").select("id, body, kind, planned_match_id, read_at, created_at").eq("player_id", player.id).order("created_at", { ascending:false }).limit(8)]);
  if (!profile) redirect("/");

  const name = displayName({
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email,
    nickname: profile.nickname,
    useNickname: profile.use_nickname,
  });
  const realName = displayName({ firstName: profile.first_name, lastName: profile.last_name, email: profile.email });

  return (
    <section>
      {(notifications ?? []).length > 0 && <section id="zeus-notifications" className="mb-7"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">From Zeus</p><form action={markNotificationsRead}><button className="font-mono text-[9px] uppercase text-muted underline">Mark all read</button></form></div><div className="mt-3 grid gap-3">{notifications!.map((notification) => <article key={notification.id} className={`border-2 border-ink bg-surface p-4 ${notification.read_at ? "" : "shadow-[3px_3px_0_var(--color-rust)]"}`}><p className="font-mono text-[9px] uppercase text-rust">{notification.kind.replaceAll("_"," ")}</p><p className="mt-2 font-body text-sm">{notification.body}</p>{notification.planned_match_id && <Link href={`/matches/${notification.planned_match_id}`} className="mt-3 inline-block font-mono text-[10px] uppercase text-green underline">{notification.kind === "result_to_approve" ? "Review result" : "Review match"}</Link>}</article>)}</div></section>}
      <p className="mb-6 font-body text-sm text-muted">Choose how the Cup sees you. Your account name stays private to these settings.</p>
      <ProfileSettingsForm
        profile={{
          name,
          nickname: profile.nickname,
          useNickname: profile.use_nickname,
          avatarUrl: profile.avatar_url,
        }}
      />
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[1px] text-muted">Account name: {realName}</p>
    </section>
  );
}
