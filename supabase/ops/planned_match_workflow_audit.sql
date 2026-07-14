-- Read-only production preflight for ADR-0033. Safe in the Supabase SQL editor.
-- SQL-editor-managed projects do not necessarily have Supabase CLI's optional
-- supabase_migrations.schema_migrations relation. Report whether it exists;
-- the enum and trigger checks below are the authoritative applied-state check.
select coalesce(
  to_regclass('supabase_migrations.schema_migrations')::text,
  'not present (normal for SQL-editor-managed migrations)'
) as migration_history_relation;

select t.typname, e.enumlabel
from pg_type t join pg_enum e on e.enumtypid=t.oid
where t.typname in ('planned_match_status','planned_result_status','notification_kind')
order by t.typname,e.enumsortorder;

select event_object_table,trigger_name,action_timing,event_manipulation
from information_schema.triggers
where trigger_schema='public' and event_object_table in ('planned_matches','planned_match_results','matches')
order by event_object_table,trigger_name,event_manipulation;

select schemaname,tablename
from pg_publication_tables
where pubname='supabase_realtime' and tablename='notifications';

select p.id,p.status,p.scheduled_at,
  concat_ws(' ',creator.first_name,creator.last_name) as creator,
  concat_ws(' ',opponent.first_name,opponent.last_name) as opponent,
  r.id as proposal_id,r.status as proposal_status,r.submitted_by,
  to_jsonb(r)->>'corrected_by' as corrected_by,
  to_jsonb(r)->>'supersedes_id' as supersedes_id,
  m.id as match_id,m.status as match_status,
  (select count(*) from public.match_sets s where s.match_id=m.id) as set_count,
  (select count(*) from public.notifications n
    where n.planned_match_id=p.id
      or to_jsonb(n)->>'match_id'=m.id::text) as notification_count
from public.planned_matches p
left join public.players creator on creator.id=p.created_by
left join public.players opponent on opponent.id=p.opponent_player_id
left join lateral (
  select * from public.planned_match_results candidate
  where candidate.planned_match_id=p.id order by candidate.created_at desc limit 1
) r on true
left join public.matches m on m.planned_match_id=p.id
where p.status not in ('confirmed','declined','cancelled')
order by p.scheduled_at,p.id;
