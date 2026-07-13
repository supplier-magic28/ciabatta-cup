"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function notificationOwnerFilter(playerId: string) {
  return `player_id=eq.${playerId}`;
}

export function NotificationRealtimeBridge({ playerId, children }: { playerId: string; children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();
    const filter = notificationOwnerFilter(playerId);
    const channel = supabase
      .channel(`zeus-notifications:${playerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, refresh)
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refresh);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [playerId, router]);

  return children;
}
