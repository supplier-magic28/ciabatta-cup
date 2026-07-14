export function hasScheduledTimePassed(scheduledAt: string, now = new Date()): boolean {
  return now.getTime() >= new Date(scheduledAt).getTime();
}

export function otherPlannedParticipant(plan: { created_by: string; opponent_player_id: string | null }, actorId: string): string | null {
  if (actorId === plan.created_by) return plan.opponent_player_id;
  if (actorId === plan.opponent_player_id) return plan.created_by;
  return null;
}
