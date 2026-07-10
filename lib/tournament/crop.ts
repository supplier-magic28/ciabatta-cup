export const TOURNAMENT_COVER_OUTPUT_WIDTH = 1280;
export const TOURNAMENT_COVER_OUTPUT_HEIGHT = 560;
export const MAX_TOURNAMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const TOURNAMENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CropAreaPixels = { x: number; y: number; width: number; height: number };

export function isAllowedTournamentPhoto(file: Pick<File, "type" | "size">): boolean {
  return TOURNAMENT_IMAGE_TYPES.includes(file.type as (typeof TOURNAMENT_IMAGE_TYPES)[number])
    && file.size > 0
    && file.size <= MAX_TOURNAMENT_IMAGE_BYTES;
}

export function clampCropArea(area: CropAreaPixels, imageWidth: number, imageHeight: number): CropAreaPixels {
  const width = Math.max(1, Math.min(Math.round(area.width), imageWidth));
  const height = Math.max(1, Math.min(Math.round(area.height), imageHeight));
  return {
    width,
    height,
    x: Math.max(0, Math.min(Math.round(area.x), imageWidth - width)),
    y: Math.max(0, Math.min(Math.round(area.y), imageHeight - height)),
  };
}

export function createTournamentCoverFile(
  imageSource: string,
  area: CropAreaPixels,
  fileName = "tournament-cover.webp",
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const crop = clampCropArea(area, image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = TOURNAMENT_COVER_OUTPUT_WIDTH;
      canvas.height = TOURNAMENT_COVER_OUTPUT_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the tournament photo."));
        return;
      }
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        TOURNAMENT_COVER_OUTPUT_WIDTH,
        TOURNAMENT_COVER_OUTPUT_HEIGHT,
      );
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not encode the tournament photo."));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/webp" }));
      }, "image/webp", 0.88);
    };
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = imageSource;
  });
}
