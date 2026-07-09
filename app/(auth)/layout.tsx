import { LoafBadge } from "@/components/brand/LoafBadge";
import { Wordmark } from "@/components/brand/Wordmark";

const TAGLINE = "EARN YOUR SEED. EARN YOUR BREAD.";

/**
 * Auth shell from design screen 05: desktop splits into a dark brand panel and
 * a cream form panel; mobile stacks a compact brand header above the form.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      {/* Desktop brand panel */}
      <aside className="hidden w-[45%] max-w-[520px] flex-col items-center justify-center gap-4 border-r-2 border-ink bg-ink md:flex">
        <LoafBadge size={96} />
        <Wordmark tone="dark" />
        <p className="font-mono text-[11px] tracking-[3px] text-muted-dark">
          {TAGLINE}
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col justify-center px-6 py-12 md:px-24">
        {/* Mobile brand header */}
        <div className="mb-8 flex flex-col items-center gap-3 md:hidden">
          <LoafBadge size={72} />
          <Wordmark tone="light" />
          <p className="font-mono text-[10px] tracking-[3px] text-crust">
            {TAGLINE}
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
