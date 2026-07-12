import { describe, expect, it } from "vitest";
import { renderExternalMatchEmail } from "./external-email";

describe("renderExternalMatchEmail", () => {
  it("renders win and loss variants and escapes private values", () => {
    const win = renderExternalMatchEmail({ firstName: "Ringo <R>", opponentName: "Dave & Co", score: "6–4", won: true });
    expect(win.html).toContain("BREAD SECURED");
    expect(win.html).toContain("Ringo &lt;R&gt;");
    expect(win.html).toContain("Dave &amp; Co");
    expect(win.text).toContain("+10 PTS");
    const loss = renderExternalMatchEmail({ firstName: "Ringo", opponentName: "Dave", score: "4–6", won: false });
    expect(loss.html).toContain("THE OVEN REMEMBERS");
    expect(loss.subject).toContain("+10 banked");
  });
});
