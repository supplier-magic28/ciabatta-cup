import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260717120000_admin_match_logging.sql", "utf8");

describe("admin match logging migration", () => {
  it("records the organiser and exposes only an authenticated guarded RPC", () => {
    expect(sql).toContain("add column admin_logged_by uuid");
    expect(sql).toContain("not public.is_admin()");
    expect(sql).toContain("grant execute on function public.admin_log_match_v1");
  });

  it("writes the score before sealing the match as approved", () => {
    expect(sql.indexOf("insert into public.match_sets")).toBeLessThan(sql.indexOf("update public.matches set status='approved'"));
    expect(sql).toContain("p_player1_id,p_player2_id,p_winner_player_id,'pending_confirmation'");
  });

  it("suppresses approval work and notifies both participants only after approval", () => {
    expect(sql).toContain("new.admin_logged_by is null");
    expect(sql).toContain("An organiser logged and approved your match.");
    expect(sql).toContain("unnest(array[new.player1_id,new.player2_id])");
  });
});
