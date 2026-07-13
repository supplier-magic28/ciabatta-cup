"use client";

import { useActionState } from "react";
import { mergeCourts } from "@/lib/courts/actions";
import type { CourtOption } from "@/lib/courts/types";
import { Button } from "@/components/ui/Button";

export function CourtMergeForm({ courts }: { courts: CourtOption[] }) {
  const [state, action, pending] = useActionState(mergeCourts, undefined);
  const select = "w-full border-2 border-ink bg-cream p-3 font-body text-sm";
  return <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="font-mono text-[10px] uppercase text-muted">Duplicate<select name="sourceId" className={`mt-1 ${select}`} required><option value="">Choose court</option>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><label className="font-mono text-[10px] uppercase text-muted">Merge into<select name="targetId" className={`mt-1 ${select}`} required><option value="">Choose canonical court</option>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><div className="self-end"><Button loading={pending}>Merge</Button></div>{state && !state.ok && <p className="font-mono text-xs text-rust sm:col-span-3">{state.error}</p>}{state?.ok && <p className="font-mono text-xs text-green sm:col-span-3">Courts merged.</p>}</form>;
}
