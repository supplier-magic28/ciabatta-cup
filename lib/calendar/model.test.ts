import { describe, expect, it } from "vitest";
import { deriveCalendarScorecard } from "./model";
import type { CalendarEvent } from "./types";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({ key: "ranked:m1", kind: "ranked", sourceId: "m1", date: "2026-07-10", startsAt: "2026-07-10T10:00:00Z", title: "vs Ada", subtitle: "Ranked", href: "/matches", status: "past", points: 30, won: true, surface: "hard", court: "Court 1", location: "Club", score: "6-3", metadataMissing: false, ...overrides });

describe("canonical calendar scorecard", () => {
  it("slices ledger awards, decay, and applied floor movement", () => {
    const score = deriveCalendarScorecard([event({}), event({ key: "ranked:m2", sourceId: "m2", date: "2026-07-11", startsAt: "2026-07-11T10:00:00Z", won: false })], [
      { date: "2026-07-10", kind: "ranked_play", sourceId: "m1", delta: 15 },
      { date: "2026-07-10", kind: "ranked_win", sourceId: "m1", delta: 15 },
      { date: "2026-07-12", kind: "decay_daily", sourceId: "2026-07-12", delta: -1 },
    ], [{ date: "2026-07-10", pointsBefore: 0, points: 30, delta: 30, appliedDelta: 30, awards: 30, decay: 0 }, { date: "2026-07-12", pointsBefore: 30, points: 29, delta: -1, appliedDelta: -1, awards: 0, decay: 1 }], "2026-07-01", "2026-07-14");
    expect(score).toMatchObject({ pointsEarned: 30, decay: 1, net: 29, won: 1, lost: 1 });
  });
  it("keeps canonical point figures while hiding external presentation rows", () => {
    const score = deriveCalendarScorecard([event({ kind: "external", points: 10 })], [{ date: "2026-07-10", kind: "external", sourceId: "m1", delta: 10 }], [{ date: "2026-07-10", pointsBefore: 0, points: 10, delta: 10, appliedDelta: 10, awards: 10, decay: 0 }], "2026-07-01", "2026-07-14", false);
    expect(score).toMatchObject({ pointsEarned: 10, net: 10, won: 0, lost: 0 });
  });
});
