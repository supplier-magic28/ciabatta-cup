/**
 * The Ciabatta loaf — a rounded-top loaf with three diagonal crumb scores.
 * The brand's trophy motif (worn by the #1 player later). Colours come from the
 * design tokens. Decorative, so it is hidden from assistive tech.
 */
export function LoafBadge({ size = 28 }: { size?: number }) {
  const height = Math.round((size * 44) / 72);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 72 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id="loaf-crust" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-crust-top)" />
          <stop offset="0.75" stopColor="var(--color-crust)" />
        </linearGradient>
      </defs>
      <path
        d="M4 42 L4 22 C4 10 14 6 36 6 C58 6 68 10 68 22 L68 42 C68 43 67 44 66 44 L6 44 C5 44 4 43 4 42 Z"
        fill="url(#loaf-crust)"
        stroke="var(--color-ink)"
        strokeWidth="2"
      />
      <g
        stroke="var(--color-crumb)"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <line x1="19" y1="17" x2="25" y2="29" />
        <line x1="33" y1="15" x2="39" y2="27" />
        <line x1="47" y1="17" x2="53" y2="29" />
      </g>
    </svg>
  );
}
