import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/types";
import { CalendarEventVisual } from "./CalendarEventVisual";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({ key:"ranked:m1",kind:"ranked",sourceId:"m1",date:"2026-07-10",startsAt:"2026-07-10T10:00:00Z",title:"vs Ada",subtitle:"Ranked",href:"/matches",status:"past",points:30,won:true,surface:"hard",court:"Court 1",location:"Club",score:"6-3",metadataMissing:false,coverImageUrl:null,participants:[{id:"self",name:"Self",avatarUrl:null,external:false},{id:"ada",name:"Ada",avatarUrl:null,external:false}],outcome:{label:"You won",detail:"6-3",tone:"win"},...overrides });

describe("CalendarEventVisual", () => {
  it("renders a tournament cover image", () => {
    const markup = renderToStaticMarkup(<CalendarEventVisual event={event({kind:"cup",title:"Qualifier",coverImageUrl:"https://example.com/cup.webp",participants:[]})}/>);
    expect(markup).toContain("Qualifier cover");
    expect(markup).toContain("cup.webp");
  });
  it("renders paired member identities and a neutral external shell", () => {
    const markup = renderToStaticMarkup(<CalendarEventVisual event={event({kind:"external",participants:[{id:"self",name:"Self",avatarUrl:null,external:false},{id:null,name:"Guest",avatarUrl:null,external:true}]})}/>);
    expect(markup).toContain("Self versus Guest");
    expect(markup).toContain("NC");
  });
});
