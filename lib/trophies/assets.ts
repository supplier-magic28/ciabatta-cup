export type TrophyAssetDefinition = {
  key: string;
  name: string;
  modelSrc: string;
  posterSrc: string;
  version: number;
  heightMeters: number;
  androidAr: boolean;
  iosAr: boolean;
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
  },
};

export function getRegisteredTrophyAsset(key: string): TrophyAssetDefinition | null {
  return TROPHY_ASSETS[key] ?? null;
}

export function hasRegisteredTrophyAsset(key: string): boolean {
  return getRegisteredTrophyAsset(key) !== null;
}
