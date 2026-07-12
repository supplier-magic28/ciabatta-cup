"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isProfileTabActive, PROFILE_TABS } from "@/lib/profile/routes";

export function ProfileTabs() {
  const pathname = usePathname();
  return <nav aria-label="Profile sections" className="mb-7 grid grid-cols-3 border-2 border-ink bg-surface">
    {PROFILE_TABS.map((tab) => {
      const active = isProfileTabActive(pathname, tab);
      return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`border-r-2 border-ink px-2 py-3 text-center font-mono text-[10px] uppercase tracking-[1.5px] last:border-r-0 ${active ? "bg-ink text-chartreuse" : "text-muted hover:bg-row"}`}>{tab.label}</Link>;
    })}
  </nav>;
}
