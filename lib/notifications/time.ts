const ZONE = "Australia/Melbourne";

export function formatNotificationTime(value: string, now = new Date()): string {
  const event = new Date(value);
  const year = new Intl.DateTimeFormat("en-AU", { year: "numeric", timeZone: ZONE }).format(event);
  const currentYear = new Intl.DateTimeFormat("en-AU", { year: "numeric", timeZone: ZONE }).format(now);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", ...(year === currentYear ? {} : { year: "numeric" as const }), hour: "numeric", minute: "2-digit", timeZone: ZONE }).format(event);
}
