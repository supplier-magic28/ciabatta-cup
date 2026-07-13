import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderTournamentEmail, sendTournamentEmail } from "./email";
import { renderResultEmail } from "./email-templates";

const base = {
  firstName: "Ringo <Zeus>", tournamentName: "Ciabatta Qualifier",
  startsAt: "2026-07-11T00:30:00.000Z", timezone: "Australia/Melbourne",
  locationName: "Northcote Tennis Club", playerCount: 4,
  tournamentUrl: "https://cup.example/tournaments/one",
};

describe("renderTournamentEmail", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cup.example";
  });

  it("renders event details and escapes player data", () => {
    const email = renderTournamentEmail({ ...base, kind: "locked_in" });
    expect(email.subject).toContain("You're locked in, Ringo <Zeus>.");
    expect(email.html).toContain("Saturday 11 July &middot; 10:30am");
    expect(email.html).toContain("Ringo &lt;Zeus&gt;");
    expect(email.html).not.toContain("Ringo <Zeus>");
    expect(email.html).toContain("https://cup.example/emails/poster-hero.jpg");
    expect(email.html).toContain("https://cup.example/emails/zeus-avatar.jpg");
    expect(email.html).not.toContain("zeus-red.png");
    expect(email.text).toContain("ENTRY CONFIRMED");
  });

  it("renders the distinct game-day message", () => {
    const email = renderTournamentEmail({ ...base, kind: "game_day" });
    expect(email.subject).toBe("It's tournament day. Let's get this bread.");
    expect(email.html).toContain("IT'S TOURNAMENT DAY");
    expect(email.html).toContain("https://cup.example/emails/northcote-hero.jpg");
    expect(email.text).toContain("BRING YOUR LEGS");
  });
});

describe("sendTournamentEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.TOURNAMENT_EMAIL_FROM = "Ciabatta Cup <cup@example.com>";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the HTML and plain-text parts with the provided idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const rendered = { subject: "Subject", html: "<p>Hello</p>", text: "Hello" };

    await expect(sendTournamentEmail("player@example.com", rendered, "tournament/one/locked_in/player")).resolves.toBe("email-1");

    const request = fetchMock.mock.calls[0][1];
    expect(request.headers["Idempotency-Key"]).toBe("tournament/one/locked_in/player");
    expect(JSON.parse(request.body)).toEqual({
      from: "Ciabatta Cup <cup@example.com>",
      to: ["player@example.com"],
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });
});

describe("renderResultEmail", () => {
  it("renders placement points and the player's complete match recap", () => {
    const email = renderResultEmail({
      ...base,
      assetBaseUrl: "https://cup.example/emails",
      placement: 1,
      points: 100,
      matches: [
        { opponentName: "Ben", score: "3-0", won: true },
        { opponentName: "Michaels", score: "3-2", won: true },
      ],
    });
    expect(email.html).toContain("+100 PTS");
    expect(email.html).toContain("W vs Ben");
    expect(email.html).toContain("W vs Michaels");
    expect(email.text).toContain("W vs Ben: 3-0");
  });
});
