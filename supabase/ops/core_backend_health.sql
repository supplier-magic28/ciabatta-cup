-- Read-only ADR-0037 backend health report. Safe in the Supabase SQL editor.
-- One result row keeps every signal visible in the dashboard's final grid.

with health as (
  select public.core_backend_health_v2() as snapshot
)
select
  snapshot->'cache' as scoring_cache,
  snapshot->'integrityIssues' as integrity_issues,
  snapshot->'deliveryCounts' as email_delivery_counts,
  snapshot->'actionableDeliveries' as actionable_email_deliveries,
  snapshot->'infrastructure' as infrastructure,
  snapshot->>'generatedAt' as generated_at
from health;
