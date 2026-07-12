export const PROFILE_TABS = [
  { href: "/profile", label: "Settings", exact: true },
  { href: "/profile/streak", label: "Streak", exact: false },
  { href: "/profile/history", label: "History", exact: false },
] as const;

export function isProfileTabActive(pathname: string, tab: (typeof PROFILE_TABS)[number]) {
  return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
}
