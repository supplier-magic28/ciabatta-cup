/** @jsxImportSource react */

export function LoadingSpinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
