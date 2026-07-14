-- Read-only ADR-0036 backend health report. Safe in the Supabase SQL editor.

select fact_version,built_version,fact_version-built_version as cache_drift,rebuilt_at
from public.scoring_cache_state where singleton;

select 'match_without_sets' as issue,m.id
from public.matches m where m.status='approved'
and not exists(select 1 from public.match_sets s where s.match_id=m.id)
union all
select 'orphan_planned_result',r.id from public.planned_match_results r
where not exists(select 1 from public.planned_matches p where p.id=r.planned_match_id)
union all
select 'planned_waiting_without_pending_proposal',p.id from public.planned_matches p
where p.status='awaiting_result_approval'
and not exists(select 1 from public.planned_match_results r where r.planned_match_id=p.id and r.status='pending')
union all
select 'planned_admin_without_pending_match',p.id from public.planned_matches p
where p.status='awaiting_admin_approval'
and not exists(select 1 from public.matches m where m.planned_match_id=p.id and m.status='pending_approval');

select status,count(*) as deliveries,max(updated_at) as latest
from public.lifecycle_email_deliveries group by status order by status;

select p.proname,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute
from pg_proc p cross join pg_roles r
where p.pronamespace='public'::regnamespace
  and p.proname in ('submit_match_v3','admin_log_match_v2','log_external_match_v2','create_planned_match_v1','confirm_match_v1','replace_rating_cache_with_reigns_v2')
  and r.rolname in ('anon','authenticated','service_role')
order by p.proname,r.rolname;

select event_object_table,trigger_name,action_timing,event_manipulation
from information_schema.triggers
where trigger_schema='public' and trigger_name in (
  'guard_match_status_graph','guard_planned_match_status_graph','guard_planned_result_status_graph',
  'scoring_version_matches','scoring_version_placements','scoring_version_practice','scoring_version_play_days',
  'matches_notification_fanout','planned_results_notification_fanout','matches_untagged_notification'
) order by event_object_table,trigger_name,event_manipulation;

select exists(
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
) as notifications_realtime_enabled;
