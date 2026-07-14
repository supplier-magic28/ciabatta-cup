import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const types=readFileSync("supabase/migrations/20260716120000_match_workflow_repair_types.sql","utf8");
const workflow=readFileSync("supabase/migrations/20260716121000_atomic_match_workflows.sql","utf8");

describe("atomic match workflow migration",()=>{
  it("adds correction revisions and precise match notification links",()=>{
    expect(types).toContain("awaiting_result_correction");expect(types).toContain("supersedes_id");expect(types).toContain("corrected_by");expect(types).toContain("match_id uuid references public.matches");
  });
  it("locks every consequential workflow and normalises either submitter perspective",()=>{
    for(const name of ["submit_match_v2","submit_planned_result_v2","approve_planned_result_v2","request_planned_result_correction_v2","correct_planned_result_v2","record_external_planned_result_v2","review_match_v2","resubmit_queried_match_v2"])expect(workflow).toContain(`function public.${name}`);
    expect(workflow.match(/for update/g)?.length).toBeGreaterThanOrEqual(7);
    expect(workflow).toContain("v_result.submitted_by = v_plan.created_by");
    expect(workflow).toContain("planned_match_id\n  ) values");
  });
  it("fans out participant and organiser actions with revision-safe dedupe",()=>{
    for(const kind of ["match_confirmation_required","match_awaiting_admin_approval","match_approved","match_queried","match_rejected","result_correction_requested"])expect(workflow).toContain(`'${kind}'`);
    expect(workflow).toContain("':result_to_approve:'||new.id");expect(workflow).toContain("Backfill only current actionable work");
  });
});
