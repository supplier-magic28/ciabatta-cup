import { describe,expect,it } from "vitest";
import { hasScheduledTimePassed, otherPlannedParticipant } from "./workflow";

describe("planned match workflow helpers",()=>{
  it("opens score entry at the exact scheduled instant",()=>{
    const scheduled="2026-07-16T08:30:00.000Z";
    expect(hasScheduledTimePassed(scheduled,new Date("2026-07-16T08:29:59.999Z"))).toBe(false);
    expect(hasScheduledTimePassed(scheduled,new Date(scheduled))).toBe(true);
  });
  it("derives the other participant from either perspective",()=>{
    const plan={created_by:"creator",opponent_player_id:"opponent"};
    expect(otherPlannedParticipant(plan,"creator")).toBe("opponent");
    expect(otherPlannedParticipant(plan,"opponent")).toBe("creator");
    expect(otherPlannedParticipant(plan,"stranger")).toBeNull();
  });
});
