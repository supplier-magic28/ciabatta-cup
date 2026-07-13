import { describe, expect, it } from "vitest";
import { matchLockedInEmail, resultConfirmedEmail } from "./email";

const locked = {
  firstName: "Ringo",
  opponentName: "Michaels",
  matchDateTime: "14 July 2026 at 7:38 am",
  location: "North Park Tennis Club, Parkville",
  matchUrl: "https://cup.example/matches/plan-one",
  assetBaseUrl: "https://cup.example/emails",
  externalOpponent: false,
};

const confirmed = {
  winnerName: "Ringo",
  loserName: "Michaels",
  score: "6–4, 7–6 (7–5)",
  matchTypeLabel: "RANKED · BEST OF 3",
  matchDate: "14 July 2026",
  scoringVariant: "ranked" as const,
  ladderUrl: "https://cup.example/",
  assetBaseUrl: "https://cup.example/emails",
};

describe("matchLockedInEmail", () => {
  it("renders the full designed internal message and matching text", () => {
    const email = matchLockedInEmail(locked);

    expect(email.subject).toBe("Ciabatta Cup: Match locked in - Ringo vs Michaels");
    expect(email.subject).not.toContain("—");
    expect(email.html).toContain("THE ORACLE IS IN");
    expect(email.html).toContain("https://cup.example/emails/zeus-red.png");
    expect(email.html).toContain("MATCH LOCKED IN");
    expect(email.html).toContain("It's on, Ringo.");
    expect(email.html).toContain("Michaels</strong> accepted.");
    expect(email.html).toContain("WHO");
    expect(email.html).toContain("WHEN");
    expect(email.html).toContain("WHERE");
    expect(email.html).toContain("STAKES");
    expect(email.html).toContain("UNDECIDED — RANKED OR NOT, YOU SETTLE IT AFTER");
    expect(email.html).toContain("— ZEUS APPROVES");
    expect(email.html).toContain('href="https://cup.example/matches/plan-one"');
    expect(email.html).toContain("Plans change?");
    expect(email.text).toContain("Michaels accepted.");
    expect(email.text).toContain("View your match: https://cup.example/matches/plan-one");
    expect(email.text).toContain("COMPETE · TRAIN · LAUGH · REPEAT");
  });

  it("uses the owner-only external copy and escapes dynamic values", () => {
    const email = matchLockedInEmail({
      ...locked,
      firstName: "Ringo <Red>",
      opponentName: "Guest & Co",
      externalOpponent: true,
    });

    expect(email.html).toContain("Ringo &lt;Red&gt;");
    expect(email.html).toContain("Guest &amp; Co");
    expect(email.html).not.toContain("accepted.");
    expect(email.text).toContain("Your match with Guest & Co is locked in.");
  });
});

describe("resultConfirmedEmail", () => {
  it("renders ranked participation, winner bonus, totals and drought reset", () => {
    const email = resultConfirmedEmail(confirmed);

    expect(email.subject).toBe("Ciabatta Cup: Ringo d. Michaels - result confirmed");
    expect(email.subject).not.toContain("—");
    expect(email.html).toContain("RESULT CONFIRMED");
    expect(email.html).toContain("6–4, 7–6 (7–5) &middot; RANKED · BEST OF 3 &middot; 14 July 2026");
    expect(email.html).toContain("Both players");
    expect(email.html).toContain("winner's bonus");
    expect(email.html).toContain("+30 / +15 TOTAL");
    expect(email.html).toContain("DROUGHT CLOCKS RESET FOR BOTH");
    expect(email.html).toContain('href="https://cup.example/"');
    expect(email.text).toContain("Both players — for playing  +15");
    expect(email.text).toContain("Ringo — winner's bonus  +15");
  });

  it("renders the internal exhibition +10-each card", () => {
    const email = resultConfirmedEmail({
      ...confirmed,
      matchTypeLabel: "NON-RANKED · SINGLE SET",
      scoringVariant: "exhibition",
    });

    expect(email.html).toContain("flat, win or lose");
    expect(email.html).toContain("NO WINNER BONUS · NO ELO MOVEMENT · CLOCKS RESET");
    expect(email.html).toContain("+10 EACH");
    expect(email.html).not.toContain("winner's bonus");
  });

  it("renders an accurate external owner-only +10 card", () => {
    const email = resultConfirmedEmail({
      ...confirmed,
      winnerName: "Guest",
      loserName: "Ringo",
      matchTypeLabel: "NON-CIABATTA · PRO SET",
      scoringVariant: "external",
    });

    expect(email.html).toContain("Ciabatta player");
    expect(email.html).toContain("+10 TOTAL");
    expect(email.html).toContain("The result is recorded and your points have landed:");
    expect(email.html).not.toContain("Both of you have signed off");
    expect(email.html).not.toContain("Guest climbs");
    expect(email.html).toContain("Guest won");
    expect(email.text).toContain("NON-CIABATTA · NO ELO MOVEMENT · CLOCK RESET  +10 TOTAL");
  });
});
