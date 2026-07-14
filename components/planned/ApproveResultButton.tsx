"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePlannedResult, requestPlannedResultCorrection } from "@/lib/planned/actions";
import { Button } from "@/components/ui/Button";

export function ApproveResultButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [action, setAction] = useState<"approve" | "correct" | null>(null);
  const router = useRouter();
  const run = (kind: "approve" | "correct") => {
    setError(""); setAction(kind);
    start(async () => {
      const result = kind === "approve" ? await approvePlannedResult(id) : await requestPlannedResultCorrection(id);
      if (!result.ok) setError(result.error); else router.refresh();
      setAction(null);
    });
  };
  return <div className="grid gap-3"><Button loading={pending && action === "approve"} loadingLabel="Confirming..." disabled={pending} onClick={() => run("approve")}>That’s how it went</Button><button type="button" disabled={pending} onClick={() => run("correct")} className="min-h-11 border-2 border-rust bg-surface px-4 font-mono text-[10px] uppercase text-rust disabled:opacity-60">{pending && action === "correct" ? "Sending to organiser..." : "This score needs correction"}</button>{error && <p className="font-mono text-[10px] text-rust" aria-live="polite">{error}</p>}</div>;
}
