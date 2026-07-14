import { describe, expect, it } from "vitest";
import { completeCalendarEvent, deriveCalendarOutcome, deriveCalendarScorecard, includeTournamentOnCalendar, recentHistoricEvents } from "./model";
import type { CalendarEvent } from "./types";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({ key: "ranked:m1", kind: "ranked", sourceId: "m1", date: "2026-07-10", startsAt: "2026-07-10T10:00:00Z", title: "vs Ada", subtitle: "Ranked", href: "/matches", status: "past", points: 30, won: true, surface: "hard", court: "Court 1", location: "Club", score: "6-3", metadataMissing: false, coverImageUrl:null, participants:[], outcome:{label:"You won",detail:"6-3",tone:"win"}, ...overrides });
const eventDraft = (value: CalendarEvent): Omit<CalendarEvent, "outcome"> => {
  const copy: Partial<CalendarEvent> = { ...value };
  delete copy.outcome;
  return copy as Omit<CalendarEvent, "outcome">;
};

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

describe("calendar event presentation", () => {
  it("publishes drafts while keeping non-draft cups personal", () => {
    expect(includeTournamentOnCalendar({ status:"draft", createdBy:"admin", isParticipant:false }, "admin")).toBe(true);
    expect(includeTournamentOnCalendar({ status:"draft", createdBy:"admin", isParticipant:true }, "player")).toBe(true);
    expect(includeTournamentOnCalendar({ status:"draft", createdBy:"admin", isParticipant:false }, "player")).toBe(true);
    expect(includeTournamentOnCalendar({ status:"scheduled", createdBy:"admin", isParticipant:false }, "player")).toBe(false);
    expect(includeTournamentOnCalendar({ status:"cancelled", createdBy:"admin", isParticipant:true }, "player")).toBe(false);
  });

  it("preserves cover and participant identities while normalizing the outcome", () => {
    const draft = eventDraft(event({
      kind: "cup",
      coverImageUrl: "https://example.com/cup.webp",
      participants: [{ id: null, name: "Guest", avatarUrl: null, external: true }],
      placement: 1,
      record: { won: 3, lost: 0 },
    }));
    const normalized = completeCalendarEvent(draft);

    expect(normalized.coverImageUrl).toBe("https://example.com/cup.webp");
    expect(normalized.participants[0]).toMatchObject({ name: "Guest", external: true });
    expect(normalized.outcome).toEqual({ label: "Cup winner", detail: "3-0 fixtures", tone: "win" });
  });
  it("selects the latest five completed events independently of range", () => {
    const events = Array.from({length:7},(_,index)=>event({key:`ranked:${index}`,sourceId:String(index),startsAt:`2026-07-${String(index+1).padStart(2,"0")}T10:00:00Z`,date:`2026-07-${String(index+1).padStart(2,"0")}`}));
    events.push(event({key:"planned:1",kind:"planned",status:"future",startsAt:"2026-08-01T10:00:00Z"}));
    expect(recentHistoricEvents(events,true).map((row)=>row.sourceId)).toEqual(["6","5","4","3","2"]);
  });
  it("fills the history limit after hiding external results", () => {
    const rows = [event({key:"external:x",kind:"external",startsAt:"2026-07-12T10:00:00Z"}),event({key:"ranked:2",sourceId:"2",startsAt:"2026-07-11T10:00:00Z"}),event({key:"ranked:1",sourceId:"1",startsAt:"2026-07-10T10:00:00Z"})];
    expect(recentHistoricEvents(rows,false,2).map((row)=>row.sourceId)).toEqual(["2","1"]);
  });
  it("derives explicit match, cup, practice, and planned outcomes", () => {
    expect(deriveCalendarOutcome({kind:"cup",status:"future",cupStatus:"draft",subtitle:"Cup"})).toEqual({label:"Draft cup",detail:"Field not locked",tone:"future"});
    expect(deriveCalendarOutcome({kind:"ranked",status:"past",won:false,score:"3-6",subtitle:"Ranked"})).toMatchObject({label:"You lost",tone:"loss"});
    expect(deriveCalendarOutcome({kind:"cup",status:"past",placement:2,record:{won:2,lost:1},subtitle:"Cup"})).toEqual({label:"2nd place",detail:"2-1 fixtures",tone:"neutral"});
    expect(deriveCalendarOutcome({kind:"practice",status:"past",subtitle:"45 minutes"})).toMatchObject({label:"Completed"});
    expect(deriveCalendarOutcome({kind:"planned",status:"awaiting_reply",subtitle:"Awaiting reply"})).toMatchObject({label:"Awaiting reply",tone:"future"});
  });
});
