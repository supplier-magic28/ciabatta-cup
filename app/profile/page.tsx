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
    .single(), supabase.from("notifications").select("id, body, kind, target_path, planned_match_id, read_at, created_at").eq("player_id", player.id).is("read_at", null).order("created_at", { ascending:false }).limit(3)]);
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
      {(notifications ?? []).length > 0 && <section id="zeus-notifications" className="mb-7"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">From Zeus · unread preview</p><div className="flex gap-3"><Link href="/notifications" className="font-mono text-[9px] uppercase text-rust underline">View all</Link><form action={markNotificationsRead}><button className="font-mono text-[9px] uppercase text-muted underline">Mark all read</button></form></div></div><div className="mt-3 grid gap-3">{notifications!.map((notification) => <article key={notification.id} className="border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-rust)]"><p className="font-mono text-[9px] uppercase text-rust">{notification.kind.replaceAll("_"," ")}</p><p className="mt-2 font-body text-sm">{notification.body}</p><Link href="/notifications" className="mt-3 inline-block font-mono text-[10px] uppercase text-green underline">Open in Zeus</Link></article>)}</div></section>}
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
