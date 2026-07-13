import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CourtOption, Surface } from "./types";

export async function loadCourtOptions(): Promise<CourtOption[]> {
  const db = await createClient();
  const [{ data: courts }, { data: matches }] = await Promise.all([
    db.from("courts").select("id, name").is("merged_into", null).order("name"),
    db.from("matches").select("court_id, surface").eq("status", "approved").not("court_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  const surfaceCounts = new Map<string, Map<Surface, number>>();
  for (const match of matches ?? []) {
    if (!match.court_id) continue;
    counts.set(match.court_id, (counts.get(match.court_id) ?? 0) + 1);
    if (match.surface) {
      const bySurface = surfaceCounts.get(match.court_id) ?? new Map<Surface, number>();
      const surface = match.surface as Surface;
      bySurface.set(surface, (bySurface.get(surface) ?? 0) + 1);
      surfaceCounts.set(match.court_id, bySurface);
    }
  }
  return (courts ?? []).map((court) => ({
    id: court.id,
    name: court.name,
    matchCount: counts.get(court.id) ?? 0,
    surfaces: [...(surfaceCounts.get(court.id) ?? new Map())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([surface]) => surface),
  }));
}
