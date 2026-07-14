export const TOURNAMENT_COVER_OUTPUT_WIDTH = 1280;
export const TOURNAMENT_COVER_OUTPUT_HEIGHT = 560;
export const MAX_TOURNAMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOURNAMENT_SOURCE_BYTES = 1536 * 1024;
export const TOURNAMENT_SOURCE_MAX_EDGE = 2048;
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

export function fitTournamentSourceDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, TOURNAMENT_SOURCE_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
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

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not encode that image.")),
    "image/webp",
    quality,
  ));
}

/**
 * Retains the complete source frame for later crop changes while bounding the
 * Server Action request well below both Next and Vercel payload limits.
 */
export async function createTournamentSourceFile(file: File): Promise<File> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not read that image."));
      element.src = source;
    });
    const dimensions = fitTournamentSourceDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.88;
    let blob = await canvasBlob(canvas, quality);
    while (blob.size > MAX_TOURNAMENT_SOURCE_BYTES && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, quality);
    }
    if (blob.size > MAX_TOURNAMENT_SOURCE_BYTES) {
      throw new Error("That image could not be reduced enough. Choose a smaller photo.");
    }
    return new File([blob], "tournament-source.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(source);
  }
}
