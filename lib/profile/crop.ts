export const AVATAR_OUTPUT_SIZE = 512;
export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CropAreaPixels = { x: number; y: number; width: number; height: number };

export function isAllowedAvatar(file: Pick<File, "type" | "size">): boolean {
  return AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])
    && file.size > 0
    && file.size <= MAX_AVATAR_UPLOAD_BYTES;
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

export function createCircularAvatarFile(
  imageSource: string,
  area: CropAreaPixels,
  fileName = "avatar.webp",
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const crop = clampCropArea(area, image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the avatar crop."));
        return;
      }
      context.clearRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      context.beginPath();
      context.arc(AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not encode the avatar crop."));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/webp" }));
      }, "image/webp", 0.88);
    };
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = imageSource;
  });
}
