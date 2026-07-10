/**
 * Pure validation for the admin invite form (ADR-0009). Mirrors what the invite
 * action needs so users get friendly errors before the network call, and so the
 * rules are testable in isolation. No I/O, no mutation of the input.
 */

export interface InviteInput {
  firstName: string;
  lastName: string;
  email: string;
}

export type InviteValidation =
  | { ok: true; value: InviteInput }
  | { ok: false; error: string };

// Deliberately loose — enough to catch typos, not to police valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildInviteRedirectTo(
  configuredSiteUrl: string | undefined,
  requestOrigin: string | null,
): string | undefined {
  const origin = configuredSiteUrl?.trim() || requestOrigin?.trim();
  if (!origin) return undefined;

  try {
    const redirect = new URL("/auth/confirm", origin);
    redirect.searchParams.set("next", "/");
    return redirect.toString();
  } catch {
    return undefined;
  }
}

export function validateInvite(input: InviteInput): InviteValidation {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";

  if (!firstName || !lastName) {
    return { ok: false, error: "Enter the player's first and last name." };
  }
  if (!email) {
    return { ok: false, error: "Enter an email address." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return { ok: true, value: { firstName, lastName, email } };
}
