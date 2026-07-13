import Image from "next/image";
import Link from "next/link";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NotificationRealtimeBridge } from "@/components/notifications/NotificationRealtimeBridge";

export function unreadBadgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function ZeusInboxButton({ unreadCount, active = false }: { unreadCount: number; active?: boolean }) {
  const messageLabel = unreadCount === 0
    ? "no unread messages"
    : `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`;

  return (
    <Link
      href="/notifications"
      aria-label={`Open Zeus notifications, ${messageLabel}`}
      aria-current={active ? "page" : undefined}
      title="Notifications from Zeus"
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-surface shadow-[3px_3px_0_var(--color-rust)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 ${active ? "border-rust ring-2 ring-rust ring-offset-2" : "border-ink"}`}
    >
      <Image
        src="/zeus-red.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 rounded-full object-cover"
      />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-cream bg-rust px-1 font-mono text-[8px] font-bold leading-none text-cream"
        >
          {unreadBadgeLabel(unreadCount)}
        </span>
      )}
    </Link>
  );
}

export async function ZeusInboxAction({ active = false }: { active?: boolean }) {
  const player = await getSessionPlayer();
  if (!player) return null;
  const db = await createClient();
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("player_id", player.id)
    .is("read_at", null);

  return (
    <NotificationRealtimeBridge playerId={player.id}>
      <ZeusInboxButton unreadCount={count ?? 0} active={active} />
    </NotificationRealtimeBridge>
  );
}

export function WorkflowZeusInboxAction() {
  return (
    <div className="mb-5 flex min-h-11 justify-end" aria-label="Notification actions">
      <ZeusInboxAction />
    </div>
  );
}
