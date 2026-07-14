"use client";

import { useEffect, useState } from "react";
import { LoafBadge } from "@/components/brand/LoafBadge";
import { dateKeyInZone } from "@/lib/profile/streak";

export function heldMelbourneCalendarDays(startedAt: string, now = new Date()): number {
  const start = dateKeyInZone(startedAt);
  const today = dateKeyInZone(now);
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000));
}

/** Live Ciabatta-holder summary; duration is calculated after client hydration. */
export function ReignSummary({ startedAt, reignNumber }: { startedAt: string; reignNumber: number }) {
  const [heldDays, setHeldDays] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHeldDays(heldMelbourneCalendarDays(startedAt));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  const duration = heldDays == null ? "current holder" : heldDays === 0 ? "held today" : `held ${heldDays} days`;

  return (
    <div className="col-span-2 flex items-center gap-2 sm:justify-end">
      <LoafBadge size={27} />
      <p className="font-mono text-[11px] uppercase tracking-[1px] text-cream">
        The Ciabatta · {duration} · reign {reignNumber}
      </p>
    </div>
  );
}
