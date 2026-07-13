"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CourtOption } from "@/lib/courts/types";
import { normalizeCourtName } from "@/lib/courts/identity";

export function CourtPicker({
  courts,
  value,
  courtId,
  onChange,
  label = "Court",
  optional = true,
}: {
  courts: CourtOption[];
  value: string;
  courtId: string;
  onChange: (value: string, courtId: string) => void;
  label?: string;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeCourtName(value);
  const matches = useMemo(() => courts.filter((court) => !normalized || normalizeCourtName(court.name).includes(normalized)).slice(0, 6), [courts, normalized]);
  const exact = courts.some((court) => normalizeCourtName(court.name) === normalized);
  return (
    <label className="relative block font-mono text-[10px] uppercase tracking-[2px] text-muted">
      {label} {optional && <span className="text-muted">Optional</span>}
      <input
        value={value}
        maxLength={160}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="court-options"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { onChange(event.target.value, ""); setOpen(true); }}
        placeholder="e.g. Northcote Tennis Club"
        className="mt-2 w-full rounded-[8px] border-2 border-ink bg-surface px-3 py-3 font-body text-[15px] normal-case tracking-normal text-ink outline-none focus:ring-2 focus:ring-green"
      />
      {open && (matches.length > 0 || (normalized && !exact)) && (
        <div id="court-options" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto border-2 border-ink bg-cream text-left shadow-[3px_3px_0_var(--color-ink)]">
          {matches.map((court) => (
            <button key={court.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(court.name, court.id); setOpen(false); }} className={`block w-full border-b border-hairline px-3 py-3 text-left ${courtId === court.id ? "bg-green text-cream" : "bg-surface text-ink"}`}>
              <span className="block font-heading text-sm font-bold normal-case tracking-normal">{court.name}</span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[1px] opacity-70">Saved · {court.matchCount} matches played here{court.surfaces.length ? ` · ${court.surfaces.join(" · ")}` : ""}</span>
            </button>
          ))}
          {normalized && !exact && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(false)} className="block w-full border-2 border-dashed border-crust bg-cream px-3 py-3 text-left font-mono text-[10px] uppercase text-crust">Add “{value.trim()}” as a new court</button>}
        </div>
      )}
      {courtId && <Link href={`/courts/${courtId}`} className="mt-1 block normal-case tracking-normal text-green underline">View court</Link>}
    </label>
  );
}
