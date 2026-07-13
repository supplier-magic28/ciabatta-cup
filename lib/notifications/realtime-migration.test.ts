import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260715122000_reliable_realtime_notifications.sql",
  "utf8",
);

describe("reliable notification migration", () => {
  it("fans out every receiver lifecycle through the database trigger", () => {
    for (const kind of [
      "match_proposed",
      "match_locked_in",
      "match_declined",
      "match_cancelled",
      "result_to_approve",
      "result_confirmed",
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    expect(migration).toContain("planned_matches_notification_fanout");
    expect(migration).toContain("on conflict (player_id, dedupe_key)");
  });

  it("publishes owner-protected notifications to Realtime idempotently", () => {
    expect(migration).toContain("pg_publication_tables");
    expect(migration).toContain("alter publication supabase_realtime add table public.notifications");
  });
});
