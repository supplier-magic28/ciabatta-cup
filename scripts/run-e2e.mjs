import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join("node_modules", "@playwright", "test", "cli.js");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The Next dev server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Smoke-test server did not start at ${baseUrl}.`);
}

const server = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
  env: { ...process.env, E2E_SMOKE_MODE: "1" },
  stdio: "inherit",
});

try {
  await waitForServer();
  const test = spawn(process.execPath, [playwrightCli, "test"], {
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
    stdio: "inherit",
  });
  const [code] = await once(test, "exit");
  if (code !== 0) process.exitCode = code ?? 1;
} finally {
  server.kill("SIGTERM");
  await once(server, "exit");
}
