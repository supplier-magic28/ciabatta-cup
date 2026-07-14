"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PlayerProfileButton({ playerId, inverse = false }: { playerId: string; inverse?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const href = `/players/${playerId}`;
  useEffect(() => { router.prefetch(href); }, [href, router]);
  return <button type="button" disabled={pending} aria-busy={pending} onClick={() => { setPending(true); router.push(href); }} className={`font-mono text-[9px] uppercase tracking-[1.2px] underline decoration-2 underline-offset-4 disabled:cursor-wait ${inverse ? "text-green-muted decoration-chartreuse" : "text-green decoration-green"}`}>{pending ? "Opening…" : "See player profile"}</button>;
}
