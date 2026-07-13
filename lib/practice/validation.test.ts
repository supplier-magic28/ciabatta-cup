import { describe, expect, it } from "vitest";
import { validatePractice } from "./validation";
describe("practice validation", () => {
  it("accepts a bounded practice claim", () => expect(validatePractice({ activity:"serves", minutes:45, practicedOn:"2026-07-12", note:"  baskets  " }, "2026-07-13")).toEqual({ ok:true, value:{ activity:"serves", minutes:45, practicedOn:"2026-07-12", note:"baskets" } }));
  it("rejects future dates and invalid durations", () => { expect(validatePractice({ activity:"other", minutes:0, practicedOn:"2026-07-12", note:"" }, "2026-07-13").ok).toBe(false); expect(validatePractice({ activity:"other", minutes:10, practicedOn:"2026-07-14", note:"" }, "2026-07-13").ok).toBe(false); });
});
