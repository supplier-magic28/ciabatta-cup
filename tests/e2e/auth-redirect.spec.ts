import { expect, test } from "@playwright/test";

test("anonymous visitors are redirected to the sign-in screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
