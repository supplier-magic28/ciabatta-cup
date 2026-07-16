export const TROPHY_SHAKE_MS = 420;
export const TROPHY_OPEN_FALLBACK_MS = 500;
export const TROPHY_HOVER_SOUND_THROTTLE_MS = 300;

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function completeTrophyActivation({
  reducedMotion,
  animationFinished,
  fallback = delay(TROPHY_OPEN_FALLBACK_MS),
  open,
}: {
  reducedMotion: boolean;
  animationFinished?: () => Promise<unknown>;
  fallback?: Promise<unknown>;
  open: () => void;
}) {
  if (!reducedMotion && animationFinished) {
    try {
      await Promise.race([animationFinished(), fallback]);
    } catch {
      await fallback;
    }
  }
  open();
}

export function canStartTrophyActivation(openingTournamentId: string | null) {
  return openingTournamentId === null;
}

export function shouldPlayTrophyHoverSound(lastPlayedAt: number, now: number) {
  return now - lastPlayedAt >= TROPHY_HOVER_SOUND_THROTTLE_MS;
}

export function trophyCoverRatio(shape: string) {
  if (shape === "square") return 1;
  if (shape === "three_two") return 3 / 2;
  return 16 / 7;
}
