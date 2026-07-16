"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { submitPractice, type PracticeActionState } from "@/lib/practice/actions";

export function PracticeForm({ today, operationKey }: { today: string; operationKey: string }) {
  const [activity, setActivity] = useState("serves");
  const [state, action, pending] = useActionState<PracticeActionState | undefined, FormData>(submitPractice, undefined);
  if (state?.ok) return <section className="border-2 border-ink bg-surface p-6 shadow-[3px_3px_0_var(--color-crust)]"><p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Awaiting approval</p><h1 className="mt-2 font-heading text-2xl font-bold">Practice submitted</h1><p className="mt-2 font-body text-sm text-muted">An organiser will review the claim. +5 lands only after approval.</p>{(state.warning ?? state.deliveryWarning?.message) && <p className="mt-3 font-mono text-xs text-rust">{state.warning ?? state.deliveryWarning?.message}</p>}<div className="mt-6 flex gap-4"><Link href="/practice/new" className="font-mono text-xs uppercase text-green">Log another</Link><Link href="/" className="font-mono text-xs uppercase text-muted">Back to ladder</Link></div></section>;
  return <form action={action} className="grid gap-5 border-2 border-ink bg-surface p-6 shadow-[3px_3px_0_var(--color-ink)]">
    <input type="hidden" name="operationKey" value={operationKey}/>
    <div><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">What did you work on?</p><div className="mt-2 grid grid-cols-3 gap-2">{[["serves","Serves"],["wall_hits","Wall hits"],["other","Other"]].map(([value,label]) => <button key={value} type="button" aria-pressed={activity===value} onClick={() => setActivity(value)} className={`border-2 border-ink px-2 py-3 font-mono text-[10px] uppercase ${activity===value ? "bg-green text-cream" : "bg-cream text-ink"}`}>{label}</button>)}</div><input type="hidden" name="activity" value={activity}/></div>
    <label className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Minutes<input name="minutes" type="number" min="1" max="300" required className="mt-2 w-full border-2 border-ink bg-cream px-3 py-3 font-body text-base text-ink"/></label>
    <label className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Practice date<input name="practicedOn" type="date" defaultValue={today} max={today} required className="mt-2 w-full border-2 border-ink bg-cream px-3 py-3 font-body text-base text-ink"/></label>
    <label className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Notes · optional<textarea name="note" maxLength={500} rows={4} className="mt-2 w-full border-2 border-ink bg-cream px-3 py-3 font-body text-base text-ink"/></label>
    <aside className="border-2 border-dashed border-crust bg-cream p-4 shadow-[3px_3px_0_var(--color-crust)]"><p className="font-mono text-xs font-bold text-crust">+5 POINTS</p><p className="mt-1 font-body text-sm">Awarded once an organiser approves your claim.</p></aside>
    {!state?.ok && state?.error && <p className="font-mono text-xs text-rust">{state.error}</p>}
    <Button type="submit" loading={pending} loadingLabel="Submitting...">Submit for approval</Button>
  </form>;
}
