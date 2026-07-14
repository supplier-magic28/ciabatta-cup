import { describe, expect, it } from "vitest";
import {
  MAX_TOURNAMENT_IMAGE_BYTES,
  MAX_TOURNAMENT_SOURCE_BYTES,
  TOURNAMENT_COVER_OUTPUT_HEIGHT,
  TOURNAMENT_COVER_OUTPUT_WIDTH,
  TOURNAMENT_SOURCE_MAX_EDGE,
  clampCropArea,
  fitTournamentSourceDimensions,
  isAllowedTournamentPhoto,
} from "./crop";

describe("tournament photo crop helpers", () => {
  it("accepts supported source types up to 5 MB", () => {
    expect(isAllowedTournamentPhoto({ type: "image/jpeg", size: 100 })).toBe(true);
    expect(isAllowedTournamentPhoto({ type: "image/png", size: MAX_TOURNAMENT_IMAGE_BYTES })).toBe(true);
    expect(isAllowedTournamentPhoto({ type: "image/gif", size: 100 })).toBe(false);
    expect(isAllowedTournamentPhoto({ type: "image/webp", size: MAX_TOURNAMENT_IMAGE_BYTES + 1 })).toBe(false);
  });

  it.each([
    ["landscape", { x: 40, y: 20, width: 800, height: 600 }, 1600, 900],
    ["portrait", { x: -10, y: 20, width: 500, height: 700 }, 600, 1200],
    ["square", { x: 0, y: 0, width: 600, height: 600 }, 600, 600],
    ["tiny", { x: -4, y: -2, width: 80, height: 90 }, 80, 90],
  ])("keeps %s crops inside source bounds", (_label, area, width, height) => {
    const result = clampCropArea(area, width, height);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(width);
    expect(result.y + result.height).toBeLessThanOrEqual(height);
  });

  it("uses a wide fixed output for the hero and list tile", () => {
    expect(TOURNAMENT_COVER_OUTPUT_WIDTH).toBe(1280);
    expect(TOURNAMENT_COVER_OUTPUT_HEIGHT).toBe(560);
    expect(TOURNAMENT_COVER_OUTPUT_WIDTH / TOURNAMENT_COVER_OUTPUT_HEIGHT).toBeCloseTo(16 / 7);
  });

  it("bounds full-frame sources below the Server Action budget without upscaling", () => {
    expect(fitTournamentSourceDimensions(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitTournamentSourceDimensions(1000, 1500)).toEqual({ width: 1000, height: 1500 });
    expect(TOURNAMENT_SOURCE_MAX_EDGE).toBe(2048);
    expect(MAX_TOURNAMENT_SOURCE_BYTES).toBe(1536 * 1024);
  });
});
