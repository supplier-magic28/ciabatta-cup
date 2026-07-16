"use client";

import { useSyncExternalStore } from "react";

export const TROPHY_SOUND_STORAGE_KEY = "ciabatta:trophy-sound";
const TROPHY_SOUND_EVENT = "ciabatta:trophy-sound-change";
let fallbackPreference = true;

export function parseTrophySoundPreference(value: string | null) {
  return value !== "off";
}

export function safelyPlayTrophySound(play: () => void | Promise<void>) {
  try {
    return Promise.resolve(play()).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

function currentPreference() {
  if (typeof window === "undefined") return fallbackPreference;
  try {
    return parseTrophySoundPreference(window.localStorage.getItem(TROPHY_SOUND_STORAGE_KEY));
  } catch {
    return fallbackPreference;
  }
}

function subscribePreference(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === TROPHY_SOUND_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(TROPHY_SOUND_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(TROPHY_SOUND_EVENT, callback);
  };
}

export function setTrophySoundPreference(enabled: boolean) {
  fallbackPreference = enabled;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TROPHY_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // The in-memory fallback still keeps the control usable in private modes.
  }
  window.dispatchEvent(new Event(TROPHY_SOUND_EVENT));
}

export function useTrophySoundPreference() {
  return useSyncExternalStore(subscribePreference, currentPreference, () => true);
}

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export class TrophySoundPlayer {
  private context: AudioContext | null = null;

  private getContext() {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const Constructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Constructor) return null;
    try {
      this.context = new Constructor();
      return this.context;
    } catch {
      return null;
    }
  }

  private async readyContext() {
    const context = this.getContext();
    if (!context) return null;
    if (context.state === "suspended") await context.resume();
    return context;
  }

  private tone(context: AudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  async playChime() {
    const context = await this.readyContext();
    if (!context) return;
    const start = context.currentTime + 0.005;
    this.tone(context, 1760, start, 0.1, 0.035, "sine");
    this.tone(context, 2637, start + 0.012, 0.12, 0.018, "triangle");
  }

  async playClank() {
    const context = await this.readyContext();
    if (!context) return;
    const start = context.currentTime + 0.005;
    this.tone(context, 420, start, 0.22, 0.055, "triangle");
    this.tone(context, 690, start + 0.006, 0.18, 0.035, "square");
    this.tone(context, 1130, start + 0.014, 0.14, 0.022, "triangle");

    const frames = Math.max(1, Math.floor(context.sampleRate * 0.11));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) channel[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 1450;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(0.035, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(start);
  }
}
