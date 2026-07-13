"use client";

import { SURFACES, type Surface } from "@/lib/courts/types";

export function SurfaceChips({ value, onChange, preferred = [] }: { value: Surface | ""; onChange: (value: Surface | "") => void; preferred?: Surface[] }) {
  const ordered = [...preferred, ...SURFACES.filter((surface) => !preferred.includes(surface))];
  return <fieldset><legend className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Surface <span className="text-muted">Optional</span></legend><div className="mt-2 flex flex-wrap gap-2">{ordered.map((surface) => <button key={surface} type="button" aria-pressed={value === surface} onClick={() => onChange(surface)} className={`border-2 border-ink px-3 py-2 font-mono text-[10px] uppercase ${value === surface ? "bg-green text-cream" : "bg-surface text-ink"}`}>{surface}</button>)}<button type="button" aria-pressed={value === ""} onClick={() => onChange("")} className={`border-2 border-dashed px-3 py-2 font-mono text-[10px] uppercase ${value === "" ? "border-crust bg-cream text-crust" : "border-muted text-muted"}`}>Set later</button></div><p className="mt-2 font-body text-xs normal-case text-muted">Surface belongs to this match and can be tagged later.</p></fieldset>;
}

