import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client built from the **secret** key. Bypasses RLS and
 * can call auth-admin APIs (e.g. `inviteUserByEmail`), so it must never be
 * imported into client code — the `server-only` guard enforces that at build
 * time. The secret key lives only in the server environment (CLAUDE.md); it is
 * never the browser-safe publishable key.
 *
 * Callers are responsible for their own authorization (e.g. an is-admin check)
 * before using this client — it has no user context of its own.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set — required for admin operations.");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
