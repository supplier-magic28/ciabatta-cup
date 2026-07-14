import { describe, expect, it } from "vitest";
import { calendarHref, clampCalendarRange, monthGrid, parseCalendarState, presetRange } from "./range";

describe("calendar range", () => {
  it("defaults to the last 30 inclusive Melbourne dates", () => expect(presetRange("2026-07-14", "30d")).toEqual({ from: "2026-06-15", to: "2026-07-14" }));
  it("clamps custom ranges to 30 inclusive days", () => expect(clampCalendarRange("2026-05-01", "2026-07-14")).toEqual({ from: "2026-06-15", to: "2026-07-14" }));
  it("validates URL state", () => expect(parseCalendarState({ preset: "custom", from: "bad", to: "2026-07-14", external: "0" }, "2026-07-14")).toMatchObject({ from: "2026-06-15", to: "2026-07-14", showExternal: false }));
  it("constructs a Monday-first six-week grid", () => { const cells = monthGrid("2026-07", "mon"); expect(cells).toHaveLength(42); expect(cells[0]).toBe("2026-06-29"); });
  it("preserves validated view settings in drill-down links", () => {
    const state = parseCalendarState({ view:"list", weekStart:"sun", external:"0" }, "2026-07-14");
    expect(calendarHref(state, { screen:"event", event:"cup:one", back:"list" })).toContain("view=list&month=2026-07&screen=event&event=cup%3Aone&back=list&weekStart=sun&external=0");
  });
});
