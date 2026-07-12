import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { getSessionPlayer } from "@/lib/auth/session";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  return <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12 pt-5 sm:px-6">
    <SiteHeader role={player.role} active="profile" />
    <header className="mb-5">
      <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Your account</p>
      <h1 className="mt-1 font-heading text-3xl font-bold text-ink">Profile</h1>
    </header>
    <ProfileTabs />
    {children}
  </main>;
}
