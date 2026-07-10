import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CANONICAL_DOCS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "ARCHITECTURE.md",
  "STATUS.md",
  "docs/SCHEMA.md",
  "docs/DESIGN.md",
  "docs/DEPLOYMENT.md",
  "docs/decisions/adr-template.md",
  "components/README.md",
  "supabase/README.md",
];

const ADR_SECTIONS = ["## Context", "## Decision", "## Consequences"];

function resolve(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(root, relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function isValidIsoDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** Return all structural documentation errors without writing to the repository. */
export function checkDocs(root = process.cwd()) {
  const errors = [];

  for (const relativePath of CANONICAL_DOCS) {
    if (!existsSync(resolve(root, relativePath))) {
      errors.push(`Missing canonical document: ${relativePath}`);
    }
  }

  const statusPath = "STATUS.md";
  if (existsSync(resolve(root, statusPath))) {
    const status = read(root, statusPath);
    const match = status.match(/^\*\*Last updated:\*\* (\d{4}-\d{2}-\d{2})$/m);
    if (!match || !isValidIsoDate(match[1])) {
      errors.push("STATUS.md must contain a valid '**Last updated:** YYYY-MM-DD' line.");
    }
  }

  const migrationsPath = resolve(root, "supabase/migrations");
  const migrationReadmePath = "supabase/README.md";
  if (!existsSync(migrationsPath)) {
    errors.push("Missing migration directory: supabase/migrations");
  } else if (existsSync(resolve(root, migrationReadmePath))) {
    const migrationReadme = read(root, migrationReadmePath);
    const migrations = readdirSync(migrationsPath).filter((file) => file.endsWith(".sql"));
    for (const migration of migrations) {
      if (!migrationReadme.includes(migration)) {
        errors.push(`Migration is not listed in supabase/README.md: ${migration}`);
      }
    }
  }

  const decisionsPath = resolve(root, "docs/decisions");
  if (!existsSync(decisionsPath)) {
    errors.push("Missing ADR directory: docs/decisions");
  } else {
    const adrFiles = readdirSync(decisionsPath)
      .filter((file) => file.endsWith(".md") && file !== "adr-template.md")
      .sort();

    for (const file of adrFiles) {
      if (!/^\d{4}-.+\.md$/.test(file)) {
        errors.push(`ADR filename must begin with four digits: docs/decisions/${file}`);
        continue;
      }

      const relativePath = `docs/decisions/${file}`;
      const adr = read(root, relativePath);
      if (!/^# ADR-\d{4}: .+/m.test(adr)) {
        errors.push(`${relativePath} must begin with an ADR title.`);
      }
      if (!/^- \*\*Status:\*\* .+/m.test(adr)) {
        errors.push(`${relativePath} is missing a Status field.`);
      }

      const date = adr.match(/^- \*\*Date:\*\* (\d{4}-\d{2}-\d{2})$/m);
      if (!date || !isValidIsoDate(date[1])) {
        errors.push(`${relativePath} is missing a valid Date field.`);
      }
      for (const section of ADR_SECTIONS) {
        if (!adr.includes(section)) errors.push(`${relativePath} is missing '${section}'.`);
      }
    }
  }

  return errors;
}

export function assertDocs(root = process.cwd()) {
  const errors = checkDocs(root);
  if (errors.length === 0) return;

  process.stderr.write(`Documentation check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) assertDocs();
