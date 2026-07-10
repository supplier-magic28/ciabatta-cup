import { describe, expect, it } from "vitest";
import { AVATAR_OUTPUT_SIZE, MAX_AVATAR_UPLOAD_BYTES, clampCropArea, isAllowedAvatar } from "./crop";

describe("avatar crop helpers", () => {
  it("accepts supported image types up to the source-size limit", () => {
    expect(isAllowedAvatar({ type: "image/jpeg", size: 100 })).toBe(true);
    expect(isAllowedAvatar({ type: "image/png", size: MAX_AVATAR_UPLOAD_BYTES })).toBe(true);
    expect(isAllowedAvatar({ type: "image/gif", size: 100 })).toBe(false);
    expect(isAllowedAvatar({ type: "image/webp", size: MAX_AVATAR_UPLOAD_BYTES + 1 })).toBe(false);
  });

  it.each([
    ["landscape", { x: 40, y: 20, width: 800, height: 600 }, 1600, 900],
    ["portrait", { x: -10, y: 20, width: 500, height: 700 }, 600, 1200],
    ["square", { x: 0, y: 0, width: 600, height: 600 }, 600, 600],
    ["tiny", { x: -4, y: -2, width: 80, height: 90 }, 80, 90],
  ])("clamps %s crops to the source bounds", (_label, area, width, height) => {
    const result = clampCropArea(area, width, height);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(width);
    expect(result.y + result.height).toBeLessThanOrEqual(height);
  });

  it("uses a fixed square output contract", () => {
    expect(AVATAR_OUTPUT_SIZE).toBe(512);
  });
});
