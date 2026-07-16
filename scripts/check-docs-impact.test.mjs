import assert from "node:assert/strict";
import test from "node:test";
import { checkDocsImpact } from "./check-docs-impact.mjs";

test("accepts documentation-only and test-only changes", () => {
  assert.deepEqual(checkDocsImpact(["docs/SCHEMA.md", "lib/scoring/materialization.test.ts", "tests/e2e/auth.spec.ts"]), []);
});

test("requires STATUS for functional runtime changes", () => {
  assert.deepEqual(checkDocsImpact(["public/manifest.json"]), ["STATUS.md must be updated for functional/runtime changes."]);
  assert.deepEqual(checkDocsImpact(["public/manifest.json", "STATUS.md"]), []);
});

test("requires schema, operations, workflows, status, and an ADR for migrations", () => {
  const incomplete = checkDocsImpact(["supabase/migrations/20260719000000_fixture.sql"]);
  assert.match(incomplete.join("\n"), /STATUS\.md/);
  assert.match(incomplete.join("\n"), /docs\/SCHEMA\.md/);
  assert.match(incomplete.join("\n"), /supabase\/README\.md/);
  assert.match(incomplete.join("\n"), /docs\/WORKFLOWS\.md/);
  assert.match(incomplete.join("\n"), /ADR document/);

  assert.deepEqual(checkDocsImpact([
    "supabase/migrations/20260719000000_fixture.sql",
    "STATUS.md",
    "docs/SCHEMA.md",
    "supabase/README.md",
    "docs/WORKFLOWS.md",
    "docs/decisions/0042-fixture.md",
  ]), []);
});

test("requires schema and architecture for scoring changes", () => {
  const result = checkDocsImpact(["lib/scoring/materialization.ts", "STATUS.md"]);
  assert.match(result.join("\n"), /docs\/SCHEMA\.md/);
  assert.match(result.join("\n"), /ARCHITECTURE\.md/);
  assert.deepEqual(checkDocsImpact([
    "lib/scoring/materialization.ts",
    "STATUS.md",
    "docs/SCHEMA.md",
    "ARCHITECTURE.md",
  ]), []);

  const migration = "supabase/migrations/20260719000000_workflow_consistency.sql";
  const migrationResult = checkDocsImpact([
    migration,
    "STATUS.md",
    "docs/SCHEMA.md",
    "supabase/README.md",
    "docs/WORKFLOWS.md",
    "docs/decisions/0042-fixture.md",
  ], { readFile: () => "update public.scoring_cache_state set fact_version = fact_version + 1;" });
  assert.match(migrationResult.join("\n"), /ARCHITECTURE\.md/);
});

test("requires the workflow registry for actions, notifications, and email", () => {
  for (const source of ["lib/match/actions.ts", "lib/notifications/actions.ts", "lib/tournament/email.ts", "lib/tournament/logic.ts"]) {
    assert.match(checkDocsImpact([source, "STATUS.md"]).join("\n"), /docs\/WORKFLOWS\.md/);
  }
});

test("requires security documentation for authorization-bearing action boundaries", () => {
  for (const source of ["lib/players/actions.ts", "lib/profile/actions.ts"]) {
    const result = checkDocsImpact([source, "STATUS.md", "docs/WORKFLOWS.md"], {
      readFile: () => "await requireAdmin(); if (player.status !== 'active') throw new Error();",
    }).join("\n");
    assert.match(result, /docs\/SCHEMA\.md/);
    assert.match(result, /supabase\/README\.md/);
    assert.match(result, /ADR document/);
  }
});

test("requires design coverage for routes and both inventories for components", () => {
  assert.deepEqual(checkDocsImpact(["app/calendar/page.tsx", "STATUS.md"]), [
    "docs/DESIGN.md must be updated for application route changes.",
  ]);
  const component = checkDocsImpact(["components/ui/Button.tsx", "STATUS.md"]);
  assert.match(component.join("\n"), /docs\/DESIGN\.md/);
  assert.match(component.join("\n"), /components\/README\.md/);
  const tokens = checkDocsImpact(["components/tokens.ts", "STATUS.md"]);
  assert.match(tokens.join("\n"), /docs\/DESIGN\.md/);
  assert.match(tokens.join("\n"), /components\/README\.md/);
});

test("requires setup and deployment docs for CI and verification tooling", () => {
  const result = checkDocsImpact([".github/workflows/ci.yml", "scripts/run-e2e.mjs"]);
  assert.deepEqual(result, [
    "README.md must be updated for setup, CI, environment, or release changes.",
    "docs/DEPLOYMENT.md must be updated for setup, CI, environment, or release changes.",
  ]);
  assert.deepEqual(checkDocsImpact([
    ".github/workflows/ci.yml",
    "README.md",
    "docs/DEPLOYMENT.md",
  ]), []);
});
