import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../components/ui/Button";
import {
  AuthFormSkeleton,
  CompactListSkeleton,
  FormPageSkeleton,
  LeaderboardSkeleton,
  ProfileSkeleton,
  TournamentBoardSkeleton,
  TournamentListSkeleton,
} from "../../components/loading/PageSkeletons";

function findCss(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findCss(target);
    return target.endsWith(".css") ? [target] : [];
  });
}

function productionCss() {
  return findCss(path.join(process.cwd(), ".next", "static"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

test("pending buttons preserve geometry and expose accessible state", async ({ page }) => {
  const idle = renderToStaticMarkup(createElement(Button, null, "Save result"));
  const pending = renderToStaticMarkup(createElement(Button, { loading: true, loadingLabel: "Saving result..." }, "Save result"));
  await page.setContent(`<style>${productionCss()}</style><div style="width:280px"><div id="idle">${idle}</div><div id="pending" style="margin-top:20px">${pending}</div></div>`);

  const idleBox = await page.locator("#idle button").boundingBox();
  const pendingBox = await page.locator("#pending button").boundingBox();
  expect(idleBox?.width).toBe(pendingBox?.width);
  expect(idleBox?.height).toBe(pendingBox?.height);
  await expect(page.locator("#pending button")).toBeDisabled();
  await expect(page.locator("#pending button")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#pending button")).toContainText("Saving result...");
});

const skeletons = [
  ["leaderboard", createElement(LeaderboardSkeleton)],
  ["auth", createElement(AuthFormSkeleton)],
  ["list", createElement(CompactListSkeleton)],
  ["form", createElement(FormPageSkeleton)],
  ["profile", createElement(ProfileSkeleton)],
  ["tournaments", createElement(TournamentListSkeleton)],
  ["tournament-board", createElement(TournamentBoardSkeleton)],
] as const;

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`loading shells fit ${viewport.width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const markup = skeletons.map(([name, component]) => `<section data-case="${name}">${renderToStaticMarkup(component)}</section>`).join("");
    await page.setContent(`<style>${productionCss()}</style>${markup}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("status")).toHaveCount(skeletons.length);
  });
}

test("skeleton motion stops when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${productionCss()}</style>${renderToStaticMarkup(createElement(LeaderboardSkeleton))}`);
  const animationName = await page.locator(".skeleton-pulse").first().evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
});

test("match-heavy reads embed sets instead of starting a second query", () => {
  const sources = [
    "app/matches/page.tsx",
    "app/admin/approvals/page.tsx",
    "app/players/[playerId]/page.tsx",
    "lib/tournament/read.ts",
  ];
  for (const source of sources) {
    const contents = readFileSync(path.join(process.cwd(), source), "utf8");
    expect(contents, source).toContain("match_sets(set_number");
    expect(contents, source).not.toMatch(/\.from\(["']match_sets["']\)/);
  }
});
