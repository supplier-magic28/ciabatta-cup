"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CourtPicker } from "./CourtPicker";
import { SurfaceChips } from "./SurfaceChips";
import { tagMatchMetadata } from "@/lib/courts/actions";
import type { CourtOption, Surface } from "@/lib/courts/types";

export function MatchMetadataEditor({ matchId, courts, initialCourtId = "", initialLocation = "", initialSurface = "" }: { matchId: string; courts: CourtOption[]; initialCourtId?: string; initialLocation?: string; initialSurface?: Surface | "" }) {
  const [courtId, setCourtId] = useState(initialCourtId);
  const [location, setLocation] = useState(initialLocation);
  const [surface, setSurface] = useState<Surface | "">(initialSurface);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const preferred = courts.find((court) => court.id === courtId)?.surfaces ?? [];
  return <div className="mt-4 grid gap-4 border-t-2 border-hairline pt-4"><CourtPicker courts={courts} value={location} courtId={courtId} onChange={(name, id) => { setLocation(name); setCourtId(id); }} /><SurfaceChips value={surface} onChange={setSurface} preferred={preferred} />{message && <p className="font-mono text-xs text-rust">{message}</p>}<div className="flex items-center gap-4"><div className="w-40"><Button loading={pending} onClick={() => startTransition(async () => { const result = await tagMatchMetadata({ matchId, courtName: location, courtId, surface }); setMessage(result.ok ? "Saved." : result.error); })}>Save tags</Button></div><a href="#next-match" className="font-mono text-[10px] uppercase text-muted underline">Skip</a></div></div>;
}

