export const SURFACES = ["hard", "clay", "grass", "synthetic"] as const;

export type Surface = (typeof SURFACES)[number];

export interface CourtOption {
  id: string;
  name: string;
  matchCount: number;
  surfaces: Surface[];
}

