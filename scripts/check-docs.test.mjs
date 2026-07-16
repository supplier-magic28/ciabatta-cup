import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDocs } from "./check-docs.mjs";

const WORKFLOW_FIELDS = [
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

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function workflowDocument() {
  return [
    "# Workflows",
    ...Array.from({ length: 12 }, (_, index) => {
      const id = `WF-${String(index + 1).padStart(3, "0")}`;
      return [
        `## ${id} - Fixture workflow`,
        "",
        "| Concern | Contract |",
        "| --- | --- |",
        ...WORKFLOW_FIELDS.map((field) => `| ${field} | Fixture |`),
      ].join("\n");
    }),
  ].join("\n\n");
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ciabatta-docs-"));
  for (const file of [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "ARCHITECTURE.md",
    "docs/SCHEMA.md",
    "docs/DEPLOYMENT.md",
    "docs/decisions/adr-template.md",
  ]) write(root, file, "# Fixture\n");

  write(root, "STATUS.md", "# Status\n\n**Last updated:** 2026-07-10\n");
  write(root, "supabase/migrations/20260710000000_fixture.sql", "select 1;\n");
  write(root, "supabase/README.md", "# Supabase\n\n## Migrations\n\n`20260710000000_fixture.sql`\n");
  write(root, "app/page.tsx", "export default function Page() {}\n");
  write(root, "components/ui/Button.tsx", "export function Button() {}\n");
  write(root, "components/tokens.ts", "export const tokens = {};\n");
  write(root, "components/README.md", "# Components\n\n## Inventory\n\n- `tokens.ts`\n- `ui/Button`\n");
  write(
    root,
    "docs/DESIGN.md",
    "# Design\n\n## Sources of truth\n\n- Tokens: `components/tokens.ts`.\n\n## Screen coverage\n\n| Screen | Production route | State |\n| --- | --- | --- |\n| Home | `/` | Implemented |\n",
  );
  write(root, "docs/WORKFLOWS.md", workflowDocument());
  write(
    root,
    "docs/decisions/0001-fixture.md",
    "# ADR-0001: Fixture\n\n- **Status:** Accepted\n- **Date:** 2026-07-10\n\n## Context\n\nFixture.\n\n## Decision\n\nFixture.\n\n## Consequences\n\nFixture.\n",
  );
  write(
    root,
    "docs/decisions/README.md",
    "# ADR index\n\n| ADR | Title | Status | Domain | Supersedes | Superseded by |\n| --- | --- | --- | --- | --- | --- |\n| [ADR-0001](0001-fixture.md) | Fixture | Accepted | Foundation | — | — |\n",
  );
  return { root, trackedFiles: new Set(["components/tokens.ts"]) };
}

function errors(fixture) {
  return checkDocs(fixture.root, { trackedFiles: fixture.trackedFiles });
}

function withFixture(run) {
  const fixture = createFixture();
  try {
    run(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

test("accepts a complete documentation fixture", () => {
  withFixture((fixture) => assert.deepEqual(errors(fixture), []));
});

test("rejects a missing or stale migration inventory entry", () => {
  withFixture((fixture) => {
    write(fixture.root, "supabase/migrations/20260710010000_unlisted.sql", "select 1;\n");
    assert.match(errors(fixture).join("\n"), /20260710010000_unlisted\.sql/);
    write(fixture.root, "supabase/README.md", "## Migrations\n\n`20260710000000_fixture.sql`\n`20260710010000_unlisted.sql`\n`20260710020000_stale.sql`\n");
    assert.match(errors(fixture).join("\n"), /migration that does not exist.*stale/i);
  });
});

test("rejects a migration inventory whose first occurrences are out of order", () => {
  withFixture((fixture) => {
    write(fixture.root, "supabase/migrations/20260710010000_second.sql", "select 1;\n");
    write(fixture.root, "supabase/README.md", "## Migrations\n\n`20260710010000_second.sql`\n`20260710000000_fixture.sql`\n");
    assert.match(errors(fixture).join("\n"), /exactly match filename order/);
  });
});

test("rejects malformed or mismatched ADR metadata", () => {
  withFixture((fixture) => {
    write(fixture.root, "docs/decisions/0001-fixture.md", "# ADR-0002: Fixture\n");
    const result = errors(fixture).join("\n");
    assert.match(result, /title ID must match/);
    assert.match(result, /missing a Status field/);
  });
});

test("rejects ADR index omissions and stale rows", () => {
  withFixture((fixture) => {
    write(fixture.root, "docs/decisions/README.md", "| [ADR-9999](9999-stale.md) | Stale | Accepted | Test | — | — |\n");
    const result = errors(fixture).join("\n");
    assert.match(result, /ADR is not listed.*ADR-0001/);
    assert.match(result, /ADR index lists an ADR that does not exist.*ADR-9999/);
  });
});

test("rejects non-reciprocal ADR supersession metadata", () => {
  withFixture((fixture) => {
    write(
      fixture.root,
      "docs/decisions/0002-new.md",
      "# ADR-0002: New\n\n- **Status:** Accepted\n- **Date:** 2026-07-11\n- **Supersedes:** ADR-0001\n\n## Context\n\nFixture.\n\n## Decision\n\nFixture.\n\n## Consequences\n\nFixture.\n",
    );
    write(
      fixture.root,
      "docs/decisions/README.md",
      "| ADR | Title | Status | Domain | Supersedes | Superseded by |\n| --- | --- | --- | --- | --- | --- |\n| [ADR-0001](0001-fixture.md) | Fixture | Accepted | Foundation | — | — |\n| [ADR-0002](0002-new.md) | New | Accepted | Foundation | ADR-0001 | — |\n",
    );
    assert.match(errors(fixture).join("\n"), /supersession metadata is not reciprocal/);
  });
});

test("rejects a missing canonical document", () => {
  withFixture((fixture) => {
    rmSync(path.join(fixture.root, "docs", "DESIGN.md"));
    assert.match(errors(fixture).join("\n"), /Missing canonical document: docs\/DESIGN\.md/);
  });
});

test("rejects an invalid status date", () => {
  withFixture((fixture) => {
    write(fixture.root, "STATUS.md", "# Status\n\n**Last updated:** 2026-02-30\n");
    assert.match(errors(fixture).join("\n"), /STATUS\.md must contain a valid/);
  });
});

test("rejects broken local document and heading links", () => {
  withFixture((fixture) => {
    write(fixture.root, "README.md", "[Missing](docs/missing.md)\n[Bad heading](ARCHITECTURE.md#missing-heading)\n");
    const result = errors(fixture).join("\n");
    assert.match(result, /Broken local link.*docs\/missing\.md/);
    assert.match(result, /Broken local heading link.*missing-heading/);
  });
});

test("rejects missing and stale application routes", () => {
  withFixture((fixture) => {
    write(fixture.root, "app/tournaments/page.tsx", "export default function Page() {}\n");
    assert.match(errors(fixture).join("\n"), /route is not listed.*\/tournaments/);
    write(
      fixture.root,
      "docs/DESIGN.md",
      "# Design\n\n## Sources of truth\n\n- Tokens: `components/tokens.ts`.\n\n## Screen coverage\n\n| Screen | Production route | State |\n| --- | --- | --- |\n| Home | `/` | Implemented |\n| Cups | `/tournaments` | Implemented |\n| Ghost | `/ghost` | Implemented |\n",
    );
    assert.match(errors(fixture).join("\n"), /route that does not exist.*\/ghost/);
  });
});

test("includes route handlers in the exact application route inventory", () => {
  withFixture((fixture) => {
    write(fixture.root, "app/auth/confirm/route.ts", "export function GET() {}\n");
    assert.match(errors(fixture).join("\n"), /route is not listed.*\/auth\/confirm/);
  });
});

test("rejects missing and stale shared components", () => {
  withFixture((fixture) => {
    write(fixture.root, "components/tournament/Board.tsx", "export function Board() {}\n");
    assert.match(errors(fixture).join("\n"), /component is not listed.*tournament\/Board/);
    write(fixture.root, "components/README.md", "- `tokens.ts`\n- `ui/Button`\n- `tournament/Board`\n- `tournament/Ghost`\n");
    assert.match(errors(fixture).join("\n"), /component that does not exist.*tournament\/Ghost/);
  });
});

test("includes shared TypeScript modules in the component inventory", () => {
  withFixture((fixture) => {
    write(fixture.root, "components/README.md", "# Components\n\n## Inventory\n\n- `ui/Button`\n");
    assert.match(errors(fixture).join("\n"), /component is not listed.*tokens/);
  });
});

test("rejects missing, duplicate, and incomplete workflow contracts", () => {
  withFixture((fixture) => {
    const incomplete = workflowDocument()
      .replace("## WF-012 - Fixture workflow", "## WF-011 - Duplicate workflow")
      .replace("| Classification | Fixture |", "| Classification removed | Fixture |", 1);
    write(fixture.root, "docs/WORKFLOWS.md", incomplete);
    const result = errors(fixture).join("\n");
    assert.match(result, /Required workflow is missing.*WF-012/);
    assert.match(result, /Workflow ID appears more than once.*WF-011/);
    assert.match(result, /missing the 'Classification' workflow field/);
  });
});

test("rejects empty workflow contracts and stale RPC or pgTAP references", () => {
  withFixture((fixture) => {
    const invalid = workflowDocument()
      .replace("| Approval | Fixture |", "| Approval |  |")
      .replace("| Transaction boundary | Fixture |", "| Transaction boundary | `missing_rpc_v9` |")
      .replace("| Contract tests | Fixture |", "| Contract tests | `core_missing` |", 1);
    write(fixture.root, "docs/WORKFLOWS.md", invalid);
    const result = errors(fixture).join("\n");
    assert.match(result, /empty 'Approval'/);
    assert.match(result, /RPC that does not exist.*missing_rpc_v9/);
    assert.match(result, /database contract test that does not exist.*core_missing/);
  });
});

test("rejects an untracked design authority", () => {
  withFixture((fixture) => {
    write(fixture.root, "design-reference/new-handoff/screen.png", "fixture");
    write(
      fixture.root,
      "docs/DESIGN.md",
      "# Design\n\n## Sources of truth\n\n- Tokens: `components/tokens.ts`.\n- New handoff: `design-reference/new-handoff/`.\n\n## Screen coverage\n\n| Screen | Production route | State |\n| --- | --- | --- |\n| Home | `/` | Implemented |\n",
    );
    assert.match(errors(fixture).join("\n"), /Design authority reference is not tracked by git/);
  });
});
