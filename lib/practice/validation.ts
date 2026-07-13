import { dateKeyInZone } from "@/lib/profile/streak";

export type PracticeActivity = "serves" | "wall_hits" | "other";
export type PracticeInput = { activity: string; minutes: number; practicedOn: string; note: string };
export type ValidPractice = { activity: PracticeActivity; minutes: number; practicedOn: string; note: string | null };

export function validatePractice(input: PracticeInput, today = dateKeyInZone(new Date())): { ok: true; value: ValidPractice } | { ok: false; error: string } {
  if (!(["serves", "wall_hits", "other"] as string[]).includes(input.activity)) return { ok: false, error: "Choose a practice activity." };
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 300) return { ok: false, error: "Minutes must be between 1 and 300." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.practicedOn) || Number.isNaN(Date.parse(`${input.practicedOn}T12:00:00Z`))) return { ok: false, error: "Enter a valid practice date." };
  if (input.practicedOn > today) return { ok: false, error: "Practice cannot be logged for a future date." };
  const note = input.note.trim();
  if (note.length > 500) return { ok: false, error: "Notes must be 500 characters or fewer." };
  return { ok: true, value: { activity: input.activity as PracticeActivity, minutes: input.minutes, practicedOn: input.practicedOn, note: note || null } };
}
