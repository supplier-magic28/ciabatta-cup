export function toggleExpanded(expanded: ReadonlySet<string>, playerId: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(playerId)) next.delete(playerId);
  else next.add(playerId);
  return next;
}

export function setAllExpanded(playerIds: readonly string[], expand: boolean): Set<string> {
  return expand ? new Set(playerIds) : new Set();
}
