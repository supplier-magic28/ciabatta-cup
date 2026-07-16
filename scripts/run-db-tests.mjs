import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = path.join(root, "supabase", "tests", "database");

function databaseTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return databaseTests(target);
    return entry.name.endsWith(".test.sql") ? [path.relative(root, target).split(path.sep).join("/")] : [];
  });
}

const files = databaseTests(testsRoot).sort();
if (files.length === 0) throw new Error("No pgTAP database tests were discovered.");

const executable = process.platform === "win32" ? "supabase.cmd" : "supabase";
const result = spawnSync(executable, ["test", "db", ...files], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
