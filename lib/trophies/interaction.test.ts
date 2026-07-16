import { describe, expect, it, vi } from "vitest";
import {
  parseTrophySoundPreference,
  safelyPlayTrophySound,
  setTrophySoundPreference,
  TROPHY_SOUND_STORAGE_KEY,
  TrophySoundPlayer,
} from "./audio";
import {
  canStartTrophyActivation,
  completeTrophyActivation,
  shouldPlayTrophyHoverSound,
  trophyCoverRatio,
} from "./interaction";

describe("trophy interaction", () => {
  it("opens only after the shake finishes", async () => {
    let finish!: () => void;
    const animation = new Promise<void>((resolve) => { finish = resolve; });
    const open = vi.fn();
    const activation = completeTrophyActivation({ reducedMotion:false, animationFinished:() => animation, fallback:new Promise(() => undefined), open });
    expect(open).not.toHaveBeenCalled();
    finish();
    await activation;
    expect(open).toHaveBeenCalledOnce();
  });

  it("uses the fallback after an animation failure and skips motion when requested", async () => {
    const fallback = Promise.resolve();
    const failedOpen = vi.fn();
    await completeTrophyActivation({ reducedMotion:false, animationFinished:() => Promise.reject(new Error("cancelled")), fallback, open:failedOpen });
    expect(failedOpen).toHaveBeenCalledOnce();
    const reducedOpen = vi.fn();
    const animationFinished = vi.fn();
    await completeTrophyActivation({ reducedMotion:true, animationFinished, open:reducedOpen });
    expect(animationFinished).not.toHaveBeenCalled();
    expect(reducedOpen).toHaveBeenCalledOnce();
  });

  it("locks duplicate activation and throttles repeated hover sounds", () => {
    expect(canStartTrophyActivation(null)).toBe(true);
    expect(canStartTrophyActivation("cup")).toBe(false);
    expect(shouldPlayTrophyHoverSound(100, 399)).toBe(false);
    expect(shouldPlayTrophyHoverSound(100, 400)).toBe(true);
  });

  it("keeps sound failures non-blocking and parses the persisted preference", async () => {
    expect(parseTrophySoundPreference(null)).toBe(true);
    expect(parseTrophySoundPreference("on")).toBe(true);
    expect(parseTrophySoundPreference("off")).toBe(false);
    await expect(safelyPlayTrophySound(() => { throw new Error("blocked"); })).resolves.toBeUndefined();
    await expect(safelyPlayTrophySound(() => Promise.reject(new Error("blocked")))).resolves.toBeUndefined();
  });

  it("persists mute and tolerates an unavailable audio context", async () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    class FailingAudioContext {
      constructor() { throw new Error("audio unavailable"); }
    }
    vi.stubGlobal("window", {
      AudioContext: FailingAudioContext,
      localStorage: { setItem },
      dispatchEvent,
    });
    setTrophySoundPreference(false);
    expect(setItem).toHaveBeenCalledWith(TROPHY_SOUND_STORAGE_KEY, "off");
    await expect(new TrophySoundPlayer().playClank()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("does not make click navigation wait for sound playback", () => {
    const open = vi.fn();
    void safelyPlayTrophySound(() => new Promise(() => undefined));
    open();
    expect(open).toHaveBeenCalledOnce();
  });

  it("returns stable cover ratios for every saved frame shape", () => {
    expect(trophyCoverRatio("wide")).toBeCloseTo(16 / 7);
    expect(trophyCoverRatio("square")).toBe(1);
    expect(trophyCoverRatio("three_two")).toBe(1.5);
  });
});
