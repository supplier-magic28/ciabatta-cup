import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";

const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join("node_modules", "@playwright", "test", "cli.js");
const EXPECTED_MANIFEST = {
  name: "Ciabatta Cup",
  short_name: "Ciabatta Cup",
  start_url: "/",
  icons: ["/cup-icon-192.png", "/cup-icon-512.png", "/cup-icon-maskable-512.png"],
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function allocatePort() {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") {
    reservation.close();
    throw new Error("Could not allocate a local port for the smoke-test server.");
  }
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function assertCiabattaManifest(manifest) {
  const iconSources = Array.isArray(manifest?.icons) ? manifest.icons.map((icon) => icon?.src) : [];
  const matches = manifest?.name === EXPECTED_MANIFEST.name
    && manifest?.short_name === EXPECTED_MANIFEST.short_name
    && manifest?.start_url === EXPECTED_MANIFEST.start_url
    && EXPECTED_MANIFEST.icons.every((icon) => iconSources.includes(icon));
  if (!matches) {
    throw new Error("Smoke-test server identity check failed: the allocated port is not serving Ciabatta Cup.");
  }
}

function childExit(child) {
  return once(child, "exit").then(([code, signal]) => ({ code, signal }));
}

async function waitForServer(baseUrl, server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Smoke-test server exited before becoming ready (code ${server.exitCode ?? "none"}, signal ${server.signalCode ?? "none"}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/manifest.json`, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        assertCiabattaManifest(await response.json());
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("identity check failed")) throw error;
      // The Next dev server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Smoke-test server did not start at ${baseUrl}.`);
}

async function stopChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([exitPromise.then(() => true), delay(5_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

async function main() {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
    env: { ...process.env, E2E_SMOKE_MODE: "1" },
    stdio: "inherit",
  });
  const serverExit = childExit(server);

  try {
    await waitForServer(baseUrl, server);
    const test = spawn(process.execPath, [playwrightCli, "test"], {
      env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
      stdio: "inherit",
    });
    const testExit = childExit(test);
    const outcome = await Promise.race([
      testExit.then((result) => ({ source: "tests", ...result })),
      serverExit.then((result) => ({ source: "server", ...result })),
    ]);

    if (outcome.source === "server") {
      await stopChild(test, testExit);
      throw new Error(`Smoke-test server exited while Playwright was running (code ${outcome.code ?? "none"}, signal ${outcome.signal ?? "none"}).`);
    }
    if (outcome.code !== 0) process.exitCode = outcome.code ?? 1;
  } finally {
    await stopChild(server, serverExit);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
