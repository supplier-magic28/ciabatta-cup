/** Pure password-recovery helpers shared by the request and update flows. */

export type PasswordValidation =
  | { ok: true; password: string }
  | { ok: false; error: string };

export function validatePassword(
  password: string,
  confirmation: string,
): PasswordValidation {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirmation) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, password };
}

export function buildRecoveryRedirectTo(
  configuredSiteUrl: string | undefined,
  requestOrigin: string | null,
): string | undefined {
  const origin = configuredSiteUrl?.trim() || requestOrigin?.trim();
  if (!origin) return undefined;

  try {
    const redirect = new URL("/auth/confirm", origin);
    redirect.searchParams.set("next", "/update-password");
    return redirect.toString();
  } catch {
    return undefined;
  }
}

export function safeAuthDestination(requestedPath: string): string {
  if (!requestedPath.startsWith("/") || requestedPath.startsWith("//")) return "/";
  return requestedPath;
}
