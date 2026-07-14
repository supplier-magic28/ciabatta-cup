import Image from "next/image";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { CalendarEvent } from "@/lib/calendar/types";

export function CalendarEventVisual({ event, size = "card" }: { event: CalendarEvent; size?: "compact" | "card" | "hero" }) {
  const frame = size === "hero" ? "h-48 sm:h-64" : size === "card" ? "h-28 sm:h-32" : "h-14 w-20 shrink-0";
  if (event.kind === "cup") return <div className={`relative overflow-hidden border-2 border-ink bg-green ${frame}`}>
    {event.coverImageUrl ? <Image src={event.coverImageUrl} alt={`${event.title} cover`} fill sizes={size === "hero" ? "(max-width: 768px) 100vw, 760px" : "(max-width: 768px) 100vw, 300px"} className="object-cover"/> : <div className="flex h-full items-center justify-center px-3 text-center font-heading text-sm font-bold text-chartreuse">CIABATTA CUP</div>}
  </div>;

  if (["ranked", "exhibition", "external", "planned"].includes(event.kind)) return <div className={`flex items-center justify-center gap-0 overflow-hidden border-2 border-ink bg-row ${frame}`} aria-label={event.participants.map((person) => person.name).join(" versus ")}>
    {event.participants.slice(0, 2).map((person, index) => person.external
      ? <span key={`external-${index}`} className={`${index ? "-ml-2" : ""} flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-green bg-surface font-mono text-[9px] font-bold text-green sm:h-12 sm:w-12`}>NC</span>
      : <PlayerAvatar key={person.id ?? `${person.name}-${index}`} name={person.name} avatarUrl={person.avatarUrl} size={size === "hero" ? 72 : size === "compact" ? 40 : 52} className={index ? "-ml-2" : ""}/>) }
  </div>;

  return <div className={`flex items-center justify-center border-2 border-dashed border-green bg-row ${frame}`}><span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-green">Practice</span></div>;
}
