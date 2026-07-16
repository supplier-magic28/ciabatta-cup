import { expect, test } from "@playwright/test";

test("anonymous visitors are redirected to the sign-in screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("anonymous visitors can open the password recovery screen", async ({ page }) => {
  await page.goto("/forgot-password");

  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
});

test("the install manifest and Android icons are public", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.json");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/json");

  const manifest = await manifestResponse.json();
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/cup-icon-192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/cup-icon-512.png", sizes: "512x512" }),
    expect.objectContaining({ src: "/cup-icon-maskable-512.png", purpose: "maskable" }),
  ]));

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toBe("image/png");
  }
});

test("3D trophy assets are public for Android AR handoff", async ({ request }) => {
  const modelResponse = await request.get("/trophies/ranked-cup-v1.glb");
  expect(modelResponse.ok()).toBe(true);
  expect(modelResponse.headers()["content-type"]).toContain("model/gltf-binary");
  expect(modelResponse.headers()["cache-control"]).toContain("immutable");
  expect((await modelResponse.body()).byteLength).toBeGreaterThan(0);
});

for (const route of ["/tournaments", "/tournaments/example/trophy", "/admin/tournaments/new", "/admin/health", "/profile"]) {
  test(`anonymous visitors cannot open ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === route);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}
