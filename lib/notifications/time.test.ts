import { describe,expect,it } from "vitest";
import { formatNotificationTime } from "./time";

describe("notification timestamps",()=>{
  it("uses Melbourne time and omits the current year",()=>{
    const text=formatNotificationTime("2026-07-14T10:30:00.000Z",new Date("2026-08-01T00:00:00.000Z"));
    expect(text).toContain("14 Jul");expect(text).toMatch(/8:30\s*pm/i);expect(text).not.toContain("2026");
  });
  it("includes the year for older notifications",()=>expect(formatNotificationTime("2025-07-14T10:30:00.000Z",new Date("2026-08-01T00:00:00.000Z"))).toContain("2025"));
});
