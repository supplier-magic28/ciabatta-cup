import { describe, expect, it } from "vitest";
import { heldMelbourneCalendarDays } from "./ReignSummary";

describe("Ciabatta reign duration", () => {
  it("counts Melbourne calendar days rather than elapsed 24-hour blocks", () => {
    expect(heldMelbourneCalendarDays(
      "2026-07-11T13:50:00Z",
      new Date("2026-07-14T00:10:00Z"),
    )).toBe(3);
  });
});
