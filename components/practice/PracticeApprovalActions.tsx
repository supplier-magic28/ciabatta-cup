"use client";
import { useState, useTransition } from "react";
import { reviewPractice } from "@/lib/practice/actions";
export function PracticeApprovalActions({ id }: { id: string }) {
  const [pending, start] = useTransition(); const [error, setError] = useState("");
  const run = (decision: "approved"|"rejected") => start(async () => { const result = await reviewPractice(id, decision); if (!result.ok) setError(result.error ?? "Review failed."); else setError(result.warning ?? ""); });
  return <div className="mt-4"><div className="grid grid-cols-2 gap-2"><button disabled={pending} onClick={() => run("approved")} className="border-2 border-ink bg-chartreuse px-3 py-2 font-mono text-xs uppercase">Approve +5</button><button disabled={pending} onClick={() => run("rejected")} className="border-2 border-rust px-3 py-2 font-mono text-xs uppercase text-rust">Reject</button></div>{error && <p className="mt-2 font-mono text-xs text-rust">{error}</p>}</div>;
}
