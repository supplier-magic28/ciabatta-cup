import Image from "next/image";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Player avatar from Supabase Storage, with an initials fallback. */
export function PlayerAvatar({
  name,
  avatarUrl,
  size = 48,
  className = "",
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full border-2 border-ink object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-label={`${name} avatar`}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-row font-heading text-xs font-bold text-green ${className}`}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
