"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { openNotification } from "@/lib/planned/actions";

export function NotificationOpenButton({ id, target }: { id: string; target: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  useEffect(() => { router.prefetch(target); }, [router, target]);
  return <div className="mt-4"><button type="button" disabled={pending} aria-busy={pending || undefined} onClick={()=>{setError("");start(async()=>{const result=await openNotification(id);if(!result.ok)setError(result.error);else router.push(result.target);});}} className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase text-green underline disabled:opacity-60">{pending&&<LoadingSpinner size={13}/>} {pending?"Opening...":"Open notification →"}</button>{error&&<p className="mt-1 font-mono text-[9px] text-rust" aria-live="polite">{error}</p>}</div>;
}
