"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/planned/actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div className="text-right"><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await markNotificationsRead(); setMessage(result.ok ? (result.count ? `Marked ${result.count} read.` : "Already caught up.") : result.error); if (result.ok) router.refresh(); })} className="font-mono text-[10px] uppercase text-muted underline disabled:opacity-50">{pending ? "Marking…" : "Mark all read"}</button>{message && <p className="mt-1 font-mono text-[9px] text-muted" aria-live="polite">{message}</p>}</div>;
}
