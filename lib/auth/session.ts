import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface SessionPlayer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "player" | "admin";
  status: "invited" | "active" | "inactive";
}

/** The authenticated auth user, or null. Verified against Supabase Auth. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Flip an `invited` player to `active` the first time they reach the app after
 * completing signup (ADR-0002, ADR-0004). The DB permits exactly this self
 * transition; role/points stay frozen. No-op for already-active players.
 */
async function ensureActivated(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("players")
    .update({ status: "active", joined_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("status", "invited");
}

/**
 * The current user's players profile (or null if not signed in). Activates an
 * invited profile on first authenticated entry before returning it.
 */
export async function getSessionPlayer(): Promise<SessionPlayer | null> {
  const user = await getUser();
  if (!user) return null;

  await ensureActivated(user.id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("players")
    .select("id, email, first_name, last_name, role, status")
    .eq("id", user.id)
    .single();

  if (!data) {
    // Auth user exists but no profile row yet (e.g. trigger not applied).
    return {
      id: user.id,
      email: user.email ?? "",
      firstName: null,
      lastName: null,
      role: "player",
      status: "invited",
    };
  }

  return {
    id: data.id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    role: data.role,
    status: data.status,
  };
}
