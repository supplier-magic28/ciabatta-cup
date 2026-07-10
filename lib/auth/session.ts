import "server-only";

import { redirect } from "next/navigation";
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
 * The current user's players profile, or null if not signed in. Pending
 * invitees stay in password setup; only that completion action activates them
 * (ADR-0013).
 */
export async function getSessionPlayer(): Promise<SessionPlayer | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("players")
    .select("id, email, first_name, last_name, role, status")
    .eq("id", user.id)
    .single();

  if (data?.status === "invited") redirect("/accept-invite");

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
