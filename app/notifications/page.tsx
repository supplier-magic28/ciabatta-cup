import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead, openNotification } from "@/lib/planned/actions";

export default async function NotificationsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const db = await createClient();
  const { data: notifications } = await db.from("notifications").select("id, kind, body, target_path, planned_match_id, read_at, created_at").eq("player_id", player.id).order("read_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(50);
  return <main className="mx-auto w-full max-w-3xl flex-1 p-6"><SiteHeader role={player.role} active="zeus" /><header className="mb-6 flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[2px] text-rust">From Zeus</p><h1 className="font-heading text-4xl font-bold text-ink">Your notifications</h1></div>{(notifications ?? []).some((item) => !item.read_at) && <form action={markNotificationsRead}><button className="font-mono text-[10px] uppercase text-muted underline">Mark all read</button></form>}</header>{!notifications?.length ? <section className="border-2 border-dashed border-hairline bg-surface p-8 text-center"><p className="font-heading text-xl font-bold">Zeus has nothing to report.</p><p className="mt-2 font-body text-sm text-muted">Silence from the mountain is usually good news.</p></section> : <ul className="grid gap-3">{notifications.map((notification) => <li key={notification.id} className={`border-2 border-ink bg-surface p-5 ${notification.read_at ? "opacity-70" : "shadow-[4px_4px_0_var(--color-rust)]"}`}><div className="flex items-start justify-between gap-3"><p className="font-mono text-[9px] uppercase tracking-[1px] text-rust">{notification.kind.replaceAll("_", " ")}</p><span className="font-mono text-[9px] uppercase text-muted">{notification.read_at ? "Read" : "New"}</span></div><p className="mt-2 font-body text-sm text-ink">{notification.body}</p>{(notification.target_path || notification.planned_match_id) && <form action={openNotification} className="mt-4"><input type="hidden" name="notificationId" value={notification.id} /><button className="font-mono text-[10px] uppercase text-green underline">Open notification →</button></form>}</li>)}</ul>}</main>;
}

