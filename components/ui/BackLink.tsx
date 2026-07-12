import Link from "next/link";

export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`inline-flex min-h-8 items-center gap-1 font-mono text-[10px] uppercase tracking-[1.4px] text-muted underline decoration-green decoration-2 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 ${className}`}><span aria-hidden="true">←</span><span>{children}</span></Link>;
}
