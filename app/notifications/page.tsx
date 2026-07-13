import { redirect } from "next/navigation";
import Image from "next/image";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { openNotification } from "@/lib/planned/actions";

export default async function NotificationsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const db = await createClient();
  const { data: notifications } = await db.from("notifications").select("id, kind, body, target_path, planned_match_id, read_at, created_at").eq("player_id", player.id).order("read_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(50);
  const unread = (notifications ?? []).filter((item) => !item.read_at).length;
  return <main className="mx-auto w-full max-w-3xl flex-1 p-6"><SiteHeader role={player.role} active="zeus" /><header className="mb-7 grid gap-5 border-2 border-ink bg-surface p-5 shadow-[5px_5px_0_var(--color-rust)] sm:grid-cols-[112px_1fr_auto] sm:items-center"><Image src="/zeus-red.png" alt="Zeus, messenger of the Ciabatta Cup" width={112} height={112} priority className="aspect-square border-2 border-ink object-cover"/><div><p className="font-mono text-[10px] uppercase tracking-[2px] text-rust">From Zeus · permanent inbox</p><h1 className="mt-1 font-heading text-4xl font-bold text-ink">Your notifications</h1><p className="mt-2 font-body text-sm text-muted">{unread ? `${unread} unread ${unread === 1 ? "message" : "messages"}. Zeus awaits your attention.` : notifications?.length ? "All caught up. Your read messages remain here." : "No messages yet. This page will be here when Zeus speaks."}</p></div>{unread > 0 && <MarkAllReadButton/>}</header>{!notifications?.length ? <section className="border-2 border-dashed border-hairline bg-surface p-8 text-center"><p className="font-heading text-xl font-bold">Zeus has nothing to report.</p><p className="mt-2 font-body text-sm text-muted">Silence from the mountain is usually good news.</p></section> : <><p className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-muted">All messages · unread first</p><ul className="grid gap-3">{notifications.map((notification) => <li key={notification.id} className={`border-2 border-ink bg-surface p-5 ${notification.read_at ? "opacity-70" : "shadow-[4px_4px_0_var(--color-rust)]"}`}><div className="flex items-start justify-between gap-3"><p className="font-mono text-[9px] uppercase tracking-[1px] text-rust">{notification.kind.replaceAll("_", " ")}</p><span className="font-mono text-[9px] uppercase text-muted">{notification.read_at ? "Read" : "New"}</span></div><p className="mt-2 font-body text-sm text-ink">{notification.body}</p>{(notification.target_path || notification.planned_match_id) && <form action={openNotification} className="mt-4"><input type="hidden" name="notificationId" value={notification.id} /><button className="font-mono text-[10px] uppercase text-green underline">Open notification →</button></form>}</li>)}</ul></>}</main>;
}
