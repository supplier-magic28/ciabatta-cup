export function normalizeCourtName(name: string): string {
  return name.trim().toLocaleLowerCase("en-AU");
}

export function canonicalCourtId(id: string, mergedInto: ReadonlyMap<string, string | null>): string {
  const seen = new Set<string>();
  let current = id;
  while (mergedInto.get(current)) {
    if (seen.has(current)) throw new Error("Court merge cycle detected.");
    seen.add(current);
    current = mergedInto.get(current)!;
  }
  return current;
}

