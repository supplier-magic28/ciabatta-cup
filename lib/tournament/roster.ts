export type TournamentRosterParticipant = {
  id: string;
  seed: number;
  name: string;
};

export type TournamentRosterPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export function buildOrderedTournamentRoster(
  seatCount: number,
  participants: readonly Pick<TournamentRosterParticipant, "id" | "seed">[],
) {
  const roster = Array<string>(seatCount).fill("");
  for (const participant of participants) {
    const index = participant.seed - 1;
    if (index >= 0 && index < seatCount) roster[index] = participant.id;
  }
  return roster;
}

export function includePersistedTournamentPlayers(
  players: readonly TournamentRosterPlayer[],
  participants: readonly TournamentRosterParticipant[],
) {
  const options = [...players];
  const optionIds = new Set(options.map((player) => player.id));
  for (const participant of participants) {
    if (optionIds.has(participant.id)) continue;
    options.push({ id: participant.id, name: participant.name, avatarUrl: null });
    optionIds.add(participant.id);
  }
  return options;
}
