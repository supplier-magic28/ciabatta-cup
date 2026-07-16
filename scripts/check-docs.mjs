import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  "docs/WORKFLOWS.md",
  "docs/decisions/README.md",
  "docs/decisions/adr-template.md",
  "components/README.md",
  "supabase/README.md",
];

const ADR_SECTIONS = ["## Context", "## Decision", "## Consequences"];
const REQUIRED_WORKFLOW_IDS = Array.from({ length: 12 }, (_, index) => `WF-${String(index + 1).padStart(3, "0")}`);
const REQUIRED_WORKFLOW_FIELDS = [
  "Actor/status",
  "Transaction boundary",
  "Transitions",
  "Idempotency",
  "Approval",
  "Scoring",
  "Zeus/dedupe",
  "Email/recovery",
  "Post-commit result",
  "Contract tests",
  "Classification",
];

function resolve(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(root, relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function relativeUnix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function pageRoute(relativePath) {
  const segments = relativePath.split("/").slice(1, -1).filter((segment) => !/^\(.+\)$/.test(segment));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function isValidIsoDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function unique(values) {
  return [...new Set(values)];
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function normalizeTitle(value) {
  return value.normalize("NFKC").replace(/[\u2012-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value) {
  return value.trim().match(/^(Proposed|Accepted|Superseded)\b/i)?.[1].toLowerCase() ?? value.trim().toLowerCase();
}

function markdownSection(markdown, heading, nextHeadingPattern = /^##?\s/m) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const contentStart = start + heading.length;
  const remainder = markdown.slice(contentStart);
  const next = remainder.search(nextHeadingPattern);
  return next < 0 ? remainder : remainder.slice(0, next);
}

function markdownHeadings(markdown) {
  const slugs = new Set();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = match[1]
      .trim()
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[`*_~]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-");
    if (slug) slugs.add(slug);
  }
  for (const match of markdown.matchAll(/<a\s+(?:name|id)=["']([^"']+)["'][^>]*>/gi)) slugs.add(match[1]);
  return slugs;
}

function loadTrackedFiles(root) {
  if (!existsSync(resolve(root, ".git"))) return null;
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "-z"], { cwd: root, encoding: "utf8" });
    return new Set(output.split("\0").filter(Boolean).map((file) => file.split(path.sep).join("/")));
  } catch {
    return null;
  }
}

function markdownFiles(root) {
  const rootDocs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(root, entry.name));
  const nested = ["docs", "components", "supabase", ".github"]
    .flatMap((directory) => walkFiles(resolve(root, directory)))
    .filter((file) => file.endsWith(".md"));
  return unique([...rootDocs, ...nested]);
}

function checkLocalLinks(root, errors) {
  for (const file of markdownFiles(root)) {
    const relativeFile = relativeUnix(root, file);
    const markdown = readFileSync(file, "utf8");
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\)/g)) {
      let target = match[1].replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:|tel:)/i.test(target) || target.startsWith("/")) continue;
      const [rawPath, fragment] = target.split("#", 2);
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath.split("?", 1)[0]);
      } catch {
        errors.push(`Malformed local link in ${relativeFile}: ${target}`);
        continue;
      }
      const targetFile = decodedPath ? path.resolve(path.dirname(file), decodedPath) : file;
      const relativeTarget = path.relative(path.resolve(root), targetFile);
      if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || !existsSync(targetFile)) {
        errors.push(`Broken local link in ${relativeFile}: ${target}`);
        continue;
      }
      if (fragment && statSync(targetFile).isFile() && targetFile.endsWith(".md")) {
        const decodedFragment = decodeURIComponent(fragment).toLowerCase();
        if (!markdownHeadings(readFileSync(targetFile, "utf8")).has(decodedFragment)) {
          errors.push(`Broken local heading link in ${relativeFile}: ${target}`);
        }
      }
    }
  }
}

function checkMigrations(root, errors) {
  const migrationsPath = resolve(root, "supabase/migrations");
  const migrationReadmePath = "supabase/README.md";
  if (!existsSync(migrationsPath)) {
    errors.push("Missing migration directory: supabase/migrations");
    return;
  }
  if (!existsSync(resolve(root, migrationReadmePath))) return;

  const migrations = readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort();
  const migrationReadme = markdownSection(read(root, migrationReadmePath), "## Migrations");
  const references = [...migrationReadme.matchAll(/\b(\d{14}_[A-Za-z0-9_.-]+\.sql)\b/g)].map((match) => match[1]);
  const firstReferences = unique(references);
  const actualSet = new Set(migrations);

  for (const migration of migrations) {
    if (!firstReferences.includes(migration)) errors.push(`Migration is not listed in supabase/README.md: ${migration}`);
  }
  for (const reference of unique(references)) {
    if (!actualSet.has(reference)) errors.push(`supabase/README.md lists a migration that does not exist: ${reference}`);
  }
  if (migrations.length === firstReferences.length && migrations.some((migration, index) => migration !== firstReferences[index])) {
    errors.push("The first-occurrence migration inventory in supabase/README.md must exactly match filename order.");
  }

  const timestamps = migrations.map((migration) => migration.slice(0, 14));
  for (const timestamp of unique(timestamps)) {
    if (timestamps.filter((candidate) => candidate === timestamp).length > 1) {
      errors.push(`Migration timestamp is not unique: ${timestamp}`);
    }
  }
}

function metadataIds(markdown, field) {
  const match = markdown.match(new RegExp(`^- \\*\\*${field}:\\*\\* (.+)$`, "mi"));
  return new Set(match ? [...match[1].matchAll(/ADR-(\d{4})/g)].map((entry) => entry[1]) : []);
}

function findCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return [...graph.keys()].some(visit);
}

function checkAdrs(root, errors) {
  const decisionsPath = resolve(root, "docs/decisions");
  if (!existsSync(decisionsPath)) {
    errors.push("Missing ADR directory: docs/decisions");
    return;
  }
  const adrFiles = readdirSync(decisionsPath)
    .filter((file) => file.endsWith(".md") && file !== "adr-template.md" && file !== "README.md")
    .sort();
  const adrs = new Map();

  for (const file of adrFiles) {
    const filename = file.match(/^(\d{4})-.+\.md$/);
    if (!filename) {
      errors.push(`ADR filename must begin with four digits: docs/decisions/${file}`);
      continue;
    }
    const relativePath = `docs/decisions/${file}`;
    const adr = read(root, relativePath);
    const title = adr.match(/^# ADR-(\d{4}): (.+)$/m);
    if (!title) errors.push(`${relativePath} must begin with an ADR title.`);
    else if (title[1] !== filename[1]) errors.push(`${relativePath} title ID must match its filename.`);
    if (adrs.has(filename[1])) errors.push(`ADR ID is duplicated: ADR-${filename[1]}`);

    const status = adr.match(/^- \*\*Status:\*\* (.+)$/m);
    if (!status) errors.push(`${relativePath} is missing a Status field.`);
    const date = adr.match(/^- \*\*Date:\*\* (\d{4}-\d{2}-\d{2})$/m);
    if (!date || !isValidIsoDate(date[1])) errors.push(`${relativePath} is missing a valid Date field.`);
    for (const section of ADR_SECTIONS) if (!adr.includes(section)) errors.push(`${relativePath} is missing '${section}'.`);

    adrs.set(filename[1], {
      file,
      title: title?.[2] ?? "",
      status: status?.[1] ?? "",
      supersedes: metadataIds(adr, "Supersedes"),
      supersededBy: metadataIds(adr, "Superseded by"),
    });
  }

  const graph = new Map([...adrs].map(([id, adr]) => [id, adr.supersedes]));
  for (const [id, adr] of adrs) {
    for (const target of adr.supersedes) {
      if (!adrs.has(target)) errors.push(`ADR-${id} supersedes missing ADR-${target}.`);
      else if (Number(target) >= Number(id)) errors.push(`ADR-${id} may only supersede an earlier ADR.`);
      else if (!adrs.get(target).supersededBy.has(id)) errors.push(`ADR-${id}/ADR-${target} supersession metadata is not reciprocal.`);
    }
    for (const source of adr.supersededBy) {
      if (!adrs.has(source)) errors.push(`ADR-${id} is superseded by missing ADR-${source}.`);
      else if (!adrs.get(source).supersedes.has(id)) errors.push(`ADR-${id}/ADR-${source} supersession metadata is not reciprocal.`);
    }
  }
  if (findCycle(graph)) errors.push("ADR supersession graph contains a cycle.");

  const indexPath = "docs/decisions/README.md";
  if (!existsSync(resolve(root, indexPath))) return;
  const rows = new Map();
  for (const line of read(root, indexPath).split(/\r?\n/)) {
    const cells = line.startsWith("|") ? line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim()) : [];
    const link = cells[0]?.match(/^\[ADR-(\d{4})\]\(([^)]+)\)$/);
    if (!link) continue;
    const [, id, linkedFile] = link;
    if (rows.has(id)) errors.push(`ADR index contains ADR-${id} more than once.`);
    rows.set(id, {
      linkedFile: linkedFile.replace(/^\.\//, ""),
      title: cells[1] ?? "",
      status: cells[2] ?? "",
      domain: cells[3] ?? "",
      supersedes: new Set([...(cells[4] ?? "").matchAll(/ADR-(\d{4})/g)].map((match) => match[1])),
      supersededBy: new Set([...(cells[5] ?? "").matchAll(/ADR-(\d{4})/g)].map((match) => match[1])),
    });
  }

  for (const [id, adr] of adrs) {
    const row = rows.get(id);
    if (!row) {
      errors.push(`ADR is not listed in docs/decisions/README.md: ADR-${id}`);
      continue;
    }
    if (row.linkedFile !== adr.file) errors.push(`ADR-${id} index link must target ${adr.file}.`);
    if (normalizeTitle(row.title) !== normalizeTitle(adr.title)) errors.push(`ADR-${id} index title does not match the ADR title.`);
    if (normalizeStatus(row.status) !== normalizeStatus(adr.status)) errors.push(`ADR-${id} index status does not match the ADR status.`);
    if (!row.domain || /^[\u2012-\u2015-]$/.test(row.domain)) errors.push(`ADR-${id} index row requires a domain.`);
    if (!sameSet(row.supersedes, adr.supersedes) || !sameSet(row.supersededBy, adr.supersededBy)) {
      errors.push(`ADR-${id} index supersession links do not match ADR metadata.`);
    }
  }
  for (const id of rows.keys()) if (!adrs.has(id)) errors.push(`ADR index lists an ADR that does not exist: ADR-${id}`);
}

function checkRoutes(root, errors) {
  const designPath = "docs/DESIGN.md";
  if (!existsSync(resolve(root, designPath))) return;
  const actual = new Set(walkFiles(resolve(root, "app"))
    .filter((file) => file.endsWith(`${path.sep}page.tsx`) || file.endsWith(`${path.sep}route.ts`))
    .map((file) => pageRoute(relativeUnix(root, file))));
  const coverage = markdownSection(read(root, designPath), "## Screen coverage");
  const documented = new Set();
  for (const line of coverage.split(/\r?\n/).filter((candidate) => candidate.startsWith("|"))) {
    const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split("|");
    for (const match of (cells[1] ?? "").matchAll(/`(\/[^`]*)`/g)) documented.add(match[1]);
  }
  for (const route of actual) if (!documented.has(route)) errors.push(`Application route is not listed in docs/DESIGN.md: ${route}`);
  for (const route of documented) if (!actual.has(route)) errors.push(`docs/DESIGN.md lists an application route that does not exist: ${route}`);
}

function checkComponents(root, errors) {
  const componentReadmePath = "components/README.md";
  const componentsRoot = resolve(root, "components");
  if (!existsSync(resolve(root, componentReadmePath)) || !existsSync(componentsRoot)) return;
  const actual = new Set(walkFiles(componentsRoot)
    .filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.(?:ts|tsx)$/.test(file))
    .map((file) => relativeUnix(componentsRoot, file).replace(/\.(?:ts|tsx)$/, "")));
  const inventory = read(root, componentReadmePath);
  const documented = new Set([...inventory.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((entry) => (entry.includes("/") || entry === "tokens.ts")
      && !entry.includes(".test")
      && !/^(?:app|components|design-reference|docs|lib|supabase)\//.test(entry))
    .map((entry) => entry.replace(/\.(?:ts|tsx)$/, "")));
  for (const component of actual) if (!documented.has(component)) errors.push(`Shared component is not listed in components/README.md: ${component}`);
  for (const component of documented) if (!actual.has(component)) errors.push(`components/README.md lists a shared component that does not exist: ${component}`);
}

function checkWorkflows(root, errors) {
  const workflowPath = "docs/WORKFLOWS.md";
  if (!existsSync(resolve(root, workflowPath))) return;
  const workflows = read(root, workflowPath);
  const migrationSql = walkFiles(resolve(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const rpcNames = new Set([...migrationSql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z][a-z0-9_]*)\s*\(/gi)]
    .map((match) => match[1].toLowerCase()));
  const databaseTests = new Set(walkFiles(resolve(root, "supabase/tests/database"))
    .filter((file) => file.endsWith(".test.sql"))
    .map((file) => path.basename(file, ".test.sql")));
  const matches = [...workflows.matchAll(/^## (WF-\d{3})\s+-\s+.+$/gm)];
  const ids = matches.map((match) => match[1]);
  for (const required of REQUIRED_WORKFLOW_IDS) {
    const count = ids.filter((id) => id === required).length;
    if (count === 0) errors.push(`Required workflow is missing from docs/WORKFLOWS.md: ${required}`);
    if (count > 1) errors.push(`Workflow ID appears more than once in docs/WORKFLOWS.md: ${required}`);
  }
  for (const id of unique(ids)) if (!REQUIRED_WORKFLOW_IDS.includes(id)) errors.push(`Unknown workflow ID in docs/WORKFLOWS.md: ${id}`);

  for (let index = 0; index < matches.length; index += 1) {
    const id = matches[index][1];
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? workflows.length;
    const section = workflows.slice(start, end);
    for (const field of REQUIRED_WORKFLOW_FIELDS) {
      const row = section.match(new RegExp(`^\\|\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|\\s*([^|]*?)\\s*\\|`, "mi"));
      if (!row) {
        errors.push(`${id} is missing the '${field}' workflow field.`);
      } else if (!row[1].trim() || /^[\u2012-\u2015-]+$/.test(row[1].trim()) || /^(?:tbd|todo)$/i.test(row[1].trim())) {
        errors.push(`${id} has an empty '${field}' workflow contract.`);
      }
    }

    const transactionRow = section.match(/^\|\s*Transaction boundary\s*\|\s*([^|]+)\|/mi)?.[1] ?? "";
    for (const reference of transactionRow.matchAll(/`([a-z][a-z0-9_]*_v\d+)`/gi)) {
      if (!rpcNames.has(reference[1].toLowerCase())) errors.push(`${id} references an RPC that does not exist: ${reference[1]}`);
    }
    const testsRow = section.match(/^\|\s*Contract tests\s*\|\s*([^|]+)\|/mi)?.[1] ?? "";
    for (const reference of testsRow.matchAll(/`(core_[a-z0-9_]+)`/gi)) {
      if (!databaseTests.has(reference[1])) errors.push(`${id} references a database contract test that does not exist: ${reference[1]}`);
    }
  }
}

function checkDesignReferences(root, trackedFiles, errors) {
  const designPath = "docs/DESIGN.md";
  if (!existsSync(resolve(root, designPath))) return;
  const sources = markdownSection(read(root, designPath), "## Sources of truth");
  const references = unique([...sources.matchAll(/`([^`]+)`/g)].map((match) => match[1])
    .filter((candidate) => /^(?:app|components|design-reference|docs|public)\//.test(candidate)));
  for (const reference of references) {
    const normalized = reference.replace(/\/$/, "");
    const target = resolve(root, normalized);
    if (!existsSync(target)) {
      errors.push(`Design authority reference does not exist: ${reference}`);
      continue;
    }
    if (trackedFiles) {
      const tracked = statSync(target).isDirectory()
        ? [...trackedFiles].some((file) => file.startsWith(`${normalized}/`))
        : trackedFiles.has(normalized);
      if (!tracked) errors.push(`Design authority reference is not tracked by git: ${reference}`);
    }
  }
}

/** Return all structural documentation errors without writing to the repository. */
export function checkDocs(root = process.cwd(), options = {}) {
  const errors = [];

  for (const relativePath of CANONICAL_DOCS) {
    if (!existsSync(resolve(root, relativePath))) errors.push(`Missing canonical document: ${relativePath}`);
  }

  const statusPath = "STATUS.md";
  if (existsSync(resolve(root, statusPath))) {
    const match = read(root, statusPath).match(/^\*\*Last updated:\*\* (\d{4}-\d{2}-\d{2})$/m);
    if (!match || !isValidIsoDate(match[1])) errors.push("STATUS.md must contain a valid '**Last updated:** YYYY-MM-DD' line.");
  }

  checkMigrations(root, errors);
  checkAdrs(root, errors);
  checkRoutes(root, errors);
  checkComponents(root, errors);
  checkWorkflows(root, errors);
  checkDesignReferences(root, options.trackedFiles ?? loadTrackedFiles(root), errors);
  checkLocalLinks(root, errors);
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
