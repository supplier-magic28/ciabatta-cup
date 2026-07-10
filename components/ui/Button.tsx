/** @jsxImportSource react */

import type { ButtonHTMLAttributes } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

/**
 * Primary action button — green fill, hard 2px ink border, solid offset shadow
 * (never blurred). Press translates into the shadow. Design-token driven.
 */
export function Button({
  className = "",
  loading = false,
  loadingLabel = "Working...",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={
        "relative w-full rounded-[8px] border-2 border-ink bg-green px-5 py-4 text-center " +
        "font-heading text-base font-bold tracking-[2px] text-cream " +
        "shadow-[3px_3px_0_var(--color-ink)] transition-transform " +
        "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
        className
      }
      {...props}
    >
      <span className={loading ? "invisible" : ""}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2" aria-live="polite">
          <LoadingSpinner />
          <span>{loadingLabel}</span>
        </span>
      )}
    </button>
  );
}
