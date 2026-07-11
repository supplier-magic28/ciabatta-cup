export function TrophyBadge({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7 4h10v4c0 3.3-2.2 6-5 6s-5-2.7-5-6V4Z" fill="var(--color-crust)" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 6H4v2c0 2.2 1.5 4 3.7 4M17 6h3v2c0 2.2-1.5 4-3.7 4M12 14v4M8.5 21h7M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}
