import { describe, expect, it } from "vitest";
import { isProfileTabActive, PROFILE_TABS } from "./routes";

describe("profile tab routing", () => {
  it("keeps settings exact and nested tabs active on their routes", () => {
    expect(PROFILE_TABS.map((tab) => tab.href)).toEqual(["/profile", "/profile/streak", "/profile/history"]);
    expect(isProfileTabActive("/profile", PROFILE_TABS[0])).toBe(true);
    expect(isProfileTabActive("/profile/history", PROFILE_TABS[0])).toBe(false);
    expect(isProfileTabActive("/profile/history", PROFILE_TABS[2])).toBe(true);
  });
});
