import type { ButtonHTMLAttributes } from "react";

/**
 * Primary action button — green fill, hard 2px ink border, solid offset shadow
 * (never blurred). Press translates into the shadow. Design-token driven.
 */
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "w-full rounded-[8px] border-2 border-ink bg-green px-5 py-4 text-center " +
        "font-heading text-base font-bold tracking-[2px] text-cream " +
        "shadow-[3px_3px_0_var(--color-ink)] transition-transform " +
        "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
        className
      }
      {...props}
    />
  );
}
