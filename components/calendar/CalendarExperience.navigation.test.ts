import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("calendar-local navigation", () => {
  it("updates browser history without invoking the Next router", () => {
    const source = readFileSync("components/calendar/CalendarExperience.tsx", "utf8");

    expect(source).toContain("window.history.pushState");
    expect(source).toContain('window.addEventListener("popstate"');
    expect(source).not.toContain("useRouter");
    expect(source).not.toContain("router.push");
  });
});
