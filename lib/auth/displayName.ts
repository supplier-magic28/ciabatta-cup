/**
 * Pure helper: the name to show for a player. Prefers full name, falls back to
 * either part, then to the email local-part, then a generic label. Kept pure
 * and tested (it drives the authenticated landing's "logged in as {name}").
 */
export function displayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const full = [first, last].filter(Boolean).join(" ");
  if (full) return full;

  const email = input.email?.trim() ?? "";
  if (email.includes("@")) return email.split("@")[0];
  if (email) return email;

  return "player";
}
