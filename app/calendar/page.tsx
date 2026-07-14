import { redirect } from "next/navigation";
import { CalendarExperience } from "@/components/calendar/CalendarExperience";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadPersonalCalendar } from "@/lib/calendar/loader";
import { parseCalendarState } from "@/lib/calendar/range";
import { dateKeyInZone } from "@/lib/profile/streak";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const today = dateKeyInZone(new Date());
  const [params, data] = await Promise.all([searchParams, loadPersonalCalendar(player, today)]);
  const state = parseCalendarState(params, today);
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6"><SiteHeader role={player.role} active="calendar"/><CalendarExperience data={data} state={state}/></main>;
}
