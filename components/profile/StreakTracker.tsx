"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { setPlayedToday, type ProfileActionState } from "@/lib/profile/actions";
import { streakWindow } from "@/lib/profile/streak";

export function StreakTracker({ playedDays, todayKey, currentStreak, bestStreak, manuallyMarkedToday }: { playedDays: string[]; todayKey: string; currentStreak: number; bestStreak: number; manuallyMarkedToday: boolean }) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [state, action, pending] = useActionState<ProfileActionState | undefined, FormData>(setPlayedToday, undefined);
  const days = streakWindow(new Set(playedDays), todayKey, period);
  const daysPlayed = days.filter((day) => day.played).length;
  return <div className="grid gap-6">
    <div className="flex rounded-full border-2 border-ink bg-surface p-1">
      {([7, 30] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`flex-1 rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[1px] ${period === value ? "bg-ink text-chartreuse" : "text-muted"}`}>Last {value} days</button>)}
    </div>
    <section className="border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
      <div className={`grid gap-3 ${period === 7 ? "grid-cols-7" : "grid-cols-10"}`}>
        {days.map((day) => <div key={day.date} className="text-center"><div title={`${day.date}: ${day.played ? "played" : "not played"}`} className={`mx-auto rounded-full border-2 ${day.today ? "ring-2 ring-chartreuse ring-offset-2 ring-offset-surface" : ""} ${period === 7 ? "h-11 w-11" : "h-6 w-6"}`} style={{ borderColor: "var(--color-ink)", background: day.played ? "radial-gradient(circle at 35% 30%, var(--color-chartreuse), var(--color-green) 68%)" : "radial-gradient(circle at 35% 30%, #d27760, var(--color-rust) 68%)" }} />{period === 7 && <p className="mt-2 font-mono text-[9px] uppercase text-muted">{new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</p>}</div>)}
      </div>
    </section>
    <section className="grid grid-cols-3 gap-3">
      <div className="border-2 border-ink bg-ink p-4 text-cream shadow-[3px_3px_0_var(--color-green)]"><p className="font-mono text-[9px] uppercase text-green-muted">Current streak</p><p className="mt-2 font-mono text-3xl font-bold text-chartreuse">{currentStreak}</p><p className="font-body text-xs">days</p></div>
      <div className="border-2 border-ink bg-surface p-4"><p className="font-mono text-[9px] uppercase text-muted">Best streak</p><p className="mt-2 font-mono text-3xl font-bold text-ink">{bestStreak}</p><p className="font-body text-xs text-muted">days</p></div>
      <div className="border-2 border-ink bg-surface p-4"><p className="font-mono text-[9px] uppercase text-muted">Days played</p><p className="mt-2 font-mono text-3xl font-bold text-ink">{daysPlayed}</p><p className="font-body text-xs text-muted">of {period}</p></div>
    </section>
    <form action={action}><input type="hidden" name="mode" value={manuallyMarkedToday ? "remove" : "mark"} /><Button type="submit" loading={pending} loadingLabel="Updating..." className="w-full">{manuallyMarkedToday ? "Remove today’s manual mark" : "I played today"}</Button>{state && <p className={`mt-3 font-mono text-xs ${state.ok ? "text-green" : "text-rust"}`}>{state.ok ? state.message : state.error}</p>}</form>
  </div>;
}
