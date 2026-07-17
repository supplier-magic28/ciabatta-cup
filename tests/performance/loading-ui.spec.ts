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
  ProfileSettingsSkeleton,
  ProfileTabSkeleton,
  TournamentBoardSkeleton,
  TournamentListSkeleton,
  TrophyViewerSkeleton,
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
  ["profile-settings", createElement(ProfileSettingsSkeleton)],
  ["profile-tab", createElement(ProfileTabSkeleton)],
  ["tournaments", createElement(TournamentListSkeleton)],
  ["tournament-board", createElement(TournamentBoardSkeleton)],
  ["trophy-viewer", createElement(TrophyViewerSkeleton)],
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

test("trophy sheet fits narrow effective viewports and keeps 44px controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 500 });
  const trophyCss = readFileSync(path.join(process.cwd(), "components/trophies/TrophyCase.module.css"), "utf8");
  await page.setContent(`<style>${productionCss()}${trophyCss}</style><div class="backdrop"><div class="sheet"><header class="sheetHeader"><div class="grabber"></div><button id="close" class="h-11 w-11">Close</button></header><div class="sheetBody"><div class="coverFrame" style="aspect-ratio:2.285714;width:min(100%,calc(38dvh * 2.285714))"></div><dl style="height:180px"></dl><div class="runRow"><span>R1</span><span>Avatar</span><span>A very long opponent name that must fit</span><span class="runScore">7–6 (12–10)</span></div></div></div></div>`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sheetBox = await page.locator(".sheet").boundingBox();
  expect(sheetBox!.width).toBeLessThanOrEqual(320);
  expect(sheetBox!.height).toBeLessThanOrEqual(500);
  const closeBox = await page.locator("#close").boundingBox();
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator(".sheetHeader").evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
});

for (const [shape, ratio] of [["wide",16/7],["square",1],["three_two",3/2]] as const) {
  test(`trophy cover preserves the ${shape} ratio`, async ({ page }) => {
    await page.setViewportSize({ width:390, height:500 });
    const trophyCss = readFileSync(path.join(process.cwd(), "components/trophies/TrophyCase.module.css"), "utf8");
    await page.setContent(`<style>${productionCss()}${trophyCss}</style><div class="coverFrame" style="aspect-ratio:${ratio};width:min(100%,calc(38dvh * ${ratio}))"></div>`);
    const box = await page.locator(".coverFrame").boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(ratio, 1);
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeLessThanOrEqual(500 * 0.38 + 2);
  });
}

test("trophy viewer remains usable in a short narrow viewport",async({page})=>{await page.setViewportSize({width:320,height:500});const viewerCss=readFileSync(path.join(process.cwd(),"components/trophies/TrophyViewer.module.css"),"utf8");await page.setContent(`<style>${productionCss()}${viewerCss}</style><main class="viewer"><header class="header"><div><p class="eyebrow">Your trophy</p><h1>The Claymore</h1></div><a id="close" class="close">×</a></header><div class="layout"><section class="stagePanel"><div class="modelStage"><p class="gestureHint">Drag to inspect</p></div></section><aside class="story"><ol class="engravings"><li><span>A long champion name</span><b>Champion · 2027</b><small>A long tournament and location name</small></li></ol></aside></div></main>`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);const close=await page.locator("#close").boundingBox();expect(close!.width).toBeGreaterThanOrEqual(44);expect(close!.height).toBeGreaterThanOrEqual(44);expect((await page.locator(".stagePanel").boundingBox())!.width).toBeLessThanOrEqual(320);});

test("Android AR integration keeps floor-placement fallback without direct camera capture",()=>{const stage=readFileSync(path.join(process.cwd(),"components/trophies/TrophyModelStage.tsx"),"utf8");const controls=readFileSync(path.join(process.cwd(),"lib/trophies/viewer.ts"),"utf8");expect(stage).toContain('"ar-modes":"webxr scene-viewer"');expect(stage).toContain('"ar-placement":"floor"');expect(stage).toContain("canActivateAR");expect(stage).toContain("androidSceneViewerIntent");expect(controls).toContain("mode=ar_preferred");expect(stage).not.toContain("quick-look");expect(stage).not.toContain("getUserMedia");});
