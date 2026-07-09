/**
 * Selectable pill — the design's Ranked/Exhibition and format chips. Hard 2px
 * ink border; selected fills green (per the tokens). Design-token driven, reused
 * anywhere a one-of-many choice is made.
 */
export function Chip({
  label,
  sublabel,
  selected = false,
  onClick,
  className = "",
}: {
  label: string;
  sublabel?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "rounded-[18px] border-2 border-ink px-4 py-2.5 text-center transition-colors " +
        (selected ? "bg-green text-cream " : "bg-surface text-ink ") +
        className
      }
    >
      <span className="block font-heading text-sm font-bold tracking-[1px]">
        {label}
      </span>
      {sublabel && (
        <span
          className={
            "mt-0.5 block font-mono text-[9px] uppercase tracking-[1.5px] " +
            (selected ? "text-green-muted" : "text-muted")
          }
        >
          {sublabel}
        </span>
      )}
    </button>
  );
}
