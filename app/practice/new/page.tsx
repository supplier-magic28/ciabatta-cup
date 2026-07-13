import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { dateKeyInZone } from "@/lib/profile/streak";
import { PracticeForm } from "@/components/practice/PracticeForm";
import { SiteHeader } from "@/components/layout/SiteHeader";
export default async function NewPracticePage() { const player = await getSessionPlayer(); if (!player) redirect("/sign-in"); return <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 sm:px-6"><SiteHeader role={player.role}/><div className="mx-auto w-full max-w-lg"><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Solo work counts</p><h1 className="mb-5 font-heading text-3xl font-bold">Log solo practice</h1><PracticeForm today={dateKeyInZone(new Date())}/></div></main>; }
