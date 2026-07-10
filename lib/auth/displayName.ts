/**
 * Pure helper: the name to show for a player. An enabled nickname takes
 * precedence; otherwise it falls back to the real name, email local-part, and
 * a generic label. Kept pure so every player-facing surface shares one rule.
 */
export function displayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  nickname?: string | null;
  useNickname?: boolean | null;
}): string {
  const nickname = input.nickname?.trim() ?? "";
  if (input.useNickname && nickname) return nickname;

  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const full = [first, last].filter(Boolean).join(" ");
  if (full) return full;

  const email = input.email?.trim() ?? "";
  if (email.includes("@")) return email.split("@")[0];
  if (email) return email;

  return "player";
}
