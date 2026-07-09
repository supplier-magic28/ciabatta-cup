/**
 * "CIABATTA CUP" wordmark — Bricolage 700, uppercase, with CUP in the accent.
 * `tone="dark"` is for the ink brand panel (cream text, chartreuse CUP);
 * `tone="light"` is for cream backgrounds (ink text, green CUP).
 */
export function Wordmark({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const ciabatta = tone === "dark" ? "text-cream" : "text-ink";
  const cup = tone === "dark" ? "text-chartreuse" : "text-green";
  return (
    <div className={`text-center font-heading font-bold leading-none ${className}`}>
      <div className={`text-4xl tracking-[2px] ${ciabatta}`}>CIABATTA</div>
      <div className={`text-2xl tracking-[9px] pl-[9px] leading-[1.4] ${cup}`}>
        CUP
      </div>
    </div>
  );
}
