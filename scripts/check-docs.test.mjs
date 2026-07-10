import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDocs } from "./check-docs.mjs";

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ciabatta-docs-"));
  for (const file of [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "ARCHITECTURE.md",
    "docs/SCHEMA.md",
    "docs/DESIGN.md",
    "docs/DEPLOYMENT.md",
    "docs/decisions/adr-template.md",
    "components/README.md",
  ]) {
    write(root, file, "# Fixture\n");
  }
  write(root, "STATUS.md", "# Status\n\n**Last updated:** 2026-07-10\n");
  write(root, "supabase/migrations/20260710000000_fixture.sql", "select 1;\n");
  write(root, "supabase/README.md", "20260710000000_fixture.sql\n");
  write(
    root,
    "docs/decisions/0001-fixture.md",
    "# ADR-0001: Fixture\n\n- **Status:** Accepted\n- **Date:** 2026-07-10\n\n## Context\n\nFixture.\n\n## Decision\n\nFixture.\n\n## Consequences\n\nFixture.\n",
  );
  return root;
}

function withFixture(run) {
  const root = createFixture();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("accepts a complete documentation fixture", () => {
  withFixture((root) => assert.deepEqual(checkDocs(root), []));
});

test("rejects an unlisted migration", () => {
  withFixture((root) => {
    write(root, "supabase/migrations/20260710010000_unlisted.sql", "select 1;\n");
    assert.match(checkDocs(root).join("\n"), /20260710010000_unlisted\.sql/);
  });
});

test("rejects a malformed ADR", () => {
  withFixture((root) => {
    write(root, "docs/decisions/0001-fixture.md", "# ADR-0001: Fixture\n");
    assert.match(checkDocs(root).join("\n"), /missing a Status field/);
  });
});

test("rejects a missing canonical document", () => {
  withFixture((root) => {
    rmSync(path.join(root, "docs", "DESIGN.md"));
    assert.match(checkDocs(root).join("\n"), /Missing canonical document: docs\/DESIGN\.md/);
  });
});

test("rejects an invalid status date", () => {
  withFixture((root) => {
    write(root, "STATUS.md", "# Status\n\n**Last updated:** 2026-02-30\n");
    assert.match(checkDocs(root).join("\n"), /STATUS\.md must contain a valid/);
  });
});
