export type TrophyAssetDefinition = {
  key: string;
  name: string;
  modelSrc: string;
  posterSrc: string;
  version: number;
  heightMeters: number;
  androidAr: boolean;
  iosAr: boolean;
  engravingMode: "lineage" | "event";
};

const TROPHY_ASSETS: Readonly<Record<string, TrophyAssetDefinition>> = {
  claymore: {
    key: "claymore",
    name: "The Claymore",
    modelSrc: "/trophies/claymore-v1.glb",
    posterSrc: "/trophies/claymore-v1.webp",
    version: 1,
    heightMeters: 0.7,
    androidAr: true,
    iosAr: false,
    engravingMode: "lineage",
  },
  ranked_cup: {
    key: "ranked_cup",
    name: "Ranked Cup",
    modelSrc: "/trophies/ranked-cup-v1.glb",
    posterSrc: "/trophies/ranked-cup-v1.webp",
    version: 1,
    heightMeters: 0.52,
    androidAr: true,
    iosAr: false,
    engravingMode: "event",
  },
};

export function getRegisteredTrophyAsset(key: string): TrophyAssetDefinition | null {
  return TROPHY_ASSETS[key] ?? null;
}

export function hasRegisteredTrophyAsset(key: string): boolean {
  return getRegisteredTrophyAsset(key) !== null;
}
