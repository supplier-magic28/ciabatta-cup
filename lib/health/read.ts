import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BackendHealth } from "./types";

export async function loadBackendHealth(): Promise<BackendHealth> {
  const client = await createClient();
  const { data, error } = await client.rpc("core_backend_health_v5");
  if (error || !data || typeof data !== "object") {
    throw new Error("Backend health is unavailable.");
  }
  return data as BackendHealth;
}
