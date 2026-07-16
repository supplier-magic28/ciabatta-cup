import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const DOCUMENT_PATHS = {
  status: "STATUS.md",
  schema: "docs/SCHEMA.md",
  architecture: "ARCHITECTURE.md",
  workflows: "docs/WORKFLOWS.md",
  design: "docs/DESIGN.md",
  components: "components/README.md",
  readme: "README.md",
  deployment: "docs/DEPLOYMENT.md",
  supabase: "supabase/README.md",
};

function normalize(file) {
  return file.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function isTest(file) {
  return /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/.test(file) || /\.(?:test|spec)\.[^.]+$/.test(file);
}

function isFunctional(file) {
  if (isTest(file)) return false;
  return /^(?:app|components|lib|public)\//.test(file)
    || /^supabase\/migrations\/.+\.sql$/.test(file)
    || /^(?:proxy\.ts|next\.config\.ts)$/.test(file);
}

function isSecurityOrMigration(file, contents = "") {
  return /^supabase\/migrations\/.+\.sql$/.test(file)
    || /^lib\/(?:auth|supabase)\//.test(file)
    || /^lib\/(?:players|profile)\/actions\.[^.]+$/.test(file)
    || (/^lib\/.+\/actions\.[^.]+$/.test(file)
      && /\b(?:requireAdmin|getSessionPlayer|is_admin|auth\.uid|players\.status|status\s*!==?\s*["']active["'])\b/.test(contents))
    || /^(?:proxy\.ts|supabase\/config\.toml)$/.test(file);
}

function isScoring(file, contents = "") {
  return !isTest(file) && (
    /^lib\/scoring\//.test(file)
    || /^supabase\/migrations\/.*(?:scor|rating|point|placement|practice|play_day).*\.sql$/i.test(file)
    || (/^supabase\/migrations\/.+\.sql$/.test(file)
      && /\b(?:scoring_cache_state|fact_version|rating_history|rating_points|tournament_placements|practice_sessions|play_days)\b/i.test(contents))
  );
}

function isWorkflow(file) {
  if (isTest(file) || !isFunctional(file)) return false;
  return /^supabase\/migrations\/.+\.sql$/.test(file)
    || /(?:^|\/)(?:actions?|[^/]*-actions?|email|notifications?)(?:\.[^/]+|\/|$)/i.test(file)
    || /^lib\/(?:courts|match|planned|players|practice|tournament)\/(?:delivery|invites?|logic|placements?|validation)\.[^/]+$/i.test(file)
    || /(?:status|rpc)/i.test(path.posix.basename(file));
}

function isRoute(file) {
  return !isTest(file) && /^app\//.test(file) && /\.(?:ts|tsx|js|jsx)$/.test(file);
}

function isSharedComponent(file) {
  return !isTest(file) && (
    /^components\/.+\.(?:ts|tsx|js|jsx)$/.test(file)
    || file === "app/globals.css"
  );
}

function isSetupOrRelease(file) {
  return /^\.github\//.test(file)
    || /^scripts\//.test(file)
    || /^(?:package(?:-lock)?\.json|next\.config\.ts|playwright(?:\.[^.]+)?\.config\.ts|vitest\.config\.ts|eslint\.config\.mjs|tsconfig\.json|postcss\.config\.mjs)$/.test(file)
    || /^(?:supabase\/config\.toml|\.env\.example)$/.test(file);
}

function addRequirement(requirements, document, reason) {
  const reasons = requirements.get(document) ?? [];
  reasons.push(reason);
  requirements.set(document, reasons);
}

/** Return documentation-impact errors for a normalized git change set. */
export function checkDocsImpact(changedFiles, options = {}) {
  const changed = new Set(changedFiles.map(normalize).filter(Boolean));
  const requirements = new Map();
  const files = [...changed];

  if (files.some(isFunctional)) addRequirement(requirements, DOCUMENT_PATHS.status, "functional/runtime changes");
  const securityOrMigration = files.some((file) => isSecurityOrMigration(file, options.readFile?.(file) ?? ""));
  if (securityOrMigration) {
    addRequirement(requirements, DOCUMENT_PATHS.schema, "schema, migration, or security changes");
    addRequirement(requirements, DOCUMENT_PATHS.supabase, "schema, migration, or security changes");
  }
  if (files.some((file) => isScoring(file, options.readFile?.(file) ?? ""))) {
    addRequirement(requirements, DOCUMENT_PATHS.schema, "scoring changes");
    addRequirement(requirements, DOCUMENT_PATHS.architecture, "scoring changes");
  }
  if (files.some(isWorkflow)) addRequirement(requirements, DOCUMENT_PATHS.workflows, "action, RPC, status, notification, or email changes");
  if (files.some(isRoute)) addRequirement(requirements, DOCUMENT_PATHS.design, "application route changes");
  if (files.some(isSharedComponent)) {
    addRequirement(requirements, DOCUMENT_PATHS.design, "shared component changes");
    addRequirement(requirements, DOCUMENT_PATHS.components, "shared component changes");
  }
  if (files.some(isSetupOrRelease)) {
    addRequirement(requirements, DOCUMENT_PATHS.readme, "setup, CI, environment, or release changes");
    addRequirement(requirements, DOCUMENT_PATHS.deployment, "setup, CI, environment, or release changes");
  }

  const errors = [];
  for (const [document, reasons] of requirements) {
    if (!changed.has(document)) errors.push(`${document} must be updated for ${unique(reasons).join(" and ")}.`);
  }
  if (securityOrMigration && !files.some((file) => /^docs\/decisions\/\d{4}-.+\.md$/.test(file))) {
    errors.push("Schema, migration, and security changes require an ADR document update.");
  }
  return errors;
}

function unique(values) {
  return [...new Set(values)];
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
}

function gitObjectExists(root, object) {
  if (!object || /^0+$/.test(object)) return false;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${object}^{commit}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveBase(root, requestedBase) {
  for (const candidate of [requestedBase, "origin/main", "HEAD^"]) {
    if (gitObjectExists(root, candidate)) return candidate;
  }
  return EMPTY_TREE;
}

/** Include committed, staged, unstaged, and untracked work in the impact check. */
export function changedFilesFromGit(root = process.cwd(), requestedBase = process.env.DOCS_IMPACT_BASE) {
  const base = resolveBase(root, requestedBase);
  const committedRange = base === EMPTY_TREE ? [base, "HEAD"] : [`${base}...HEAD`];
  const committed = git(root, ["diff", "--name-only", "--diff-filter=ACMRD", ...committedRange]);
  const staged = git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"]);
  const unstaged = git(root, ["diff", "--name-only", "--diff-filter=ACMRD"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  return unique([...committed, ...staged, ...unstaged, ...untracked]).sort();
}

export function assertDocsImpact(root = process.cwd()) {
  const changed = changedFilesFromGit(root, process.argv[2] ?? process.env.DOCS_IMPACT_BASE);
  const errors = checkDocsImpact(changed, {
    readFile(file) {
      const target = path.join(root, ...file.split("/"));
      return existsSync(target) ? readFileSync(target, "utf8") : "";
    },
  });
  if (errors.length === 0) return;
  process.stderr.write(`Documentation impact check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) assertDocsImpact();
