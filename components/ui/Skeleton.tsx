/** @jsxImportSource react */

import type { HTMLAttributes } from "react";

export function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-pulse rounded-[4px] bg-hairline ${className}`}
      {...props}
    />
  );
}
