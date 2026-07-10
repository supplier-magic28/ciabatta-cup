import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/performance",
  timeout: 30_000,
  workers: 1,
  use: { viewport: { width: 390, height: 844 } },
});
