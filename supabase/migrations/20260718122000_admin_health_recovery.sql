-- In-app organiser health and recovery diagnostics (ADR-0037).

create or replace function public.core_backend_health_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cache jsonb;
  v_integrity jsonb;
  v_delivery_counts jsonb;
  v_actionable_deliveries jsonb;
  v_triggers jsonb;
  v_realtime boolean;
begin
  -- auth.uid() is null for the postgres role in the SQL editor. Runtime callers
  -- receive EXECUTE only through authenticated and must be active organisers.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only organisers may inspect backend health';
  end if;

  select jsonb_build_object(
    'factVersion', fact_version,
    'builtVersion', built_version,
    'drift', fact_version - built_version,
    'rebuiltAt', rebuilt_at
  ) into v_cache
  from public.scoring_cache_state
  where singleton;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', issue,
    'entityId', id
  ) order by issue, id), '[]'::jsonb)
  into v_integrity
  from (
    select 'match_without_sets'::text as issue, m.id
    from public.matches m
    where m.status = 'approved'
      and not exists(select 1 from public.match_sets s where s.match_id = m.id)
    union all
    select 'orphan_planned_result', r.id
    from public.planned_match_results r
    where not exists(select 1 from public.planned_matches p where p.id = r.planned_match_id)
    union all
    select 'planned_waiting_without_pending_proposal', p.id
    from public.planned_matches p
    where p.status = 'awaiting_result_approval'
      and not exists(
        select 1 from public.planned_match_results r
        where r.planned_match_id = p.id and r.status = 'pending'
      )
    union all
    select 'planned_admin_without_pending_match', p.id
    from public.planned_matches p
    where p.status = 'awaiting_admin_approval'
      and not exists(
        select 1 from public.matches m
        where m.planned_match_id = p.id and m.status = 'pending_approval'
      )
  ) issues;

  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
  into v_delivery_counts
  from (
    select status, count(*) as total
    from public.lifecycle_email_deliveries
    group by status
  ) counts;

  select coalesce(jsonb_agg(jsonb_build_object(
    'idempotencyKey', idempotency_key,
    'kind', kind,
    'playerId', player_id,
    'entityType', entity_type,
    'entityId', entity_id,
    'status', status,
    'attemptCount', attempt_count,
    'lastError', last_error,
    'updatedAt', updated_at,
    'stale', status = 'pending' and updated_at <= now() - interval '15 minutes'
  ) order by updated_at), '[]'::jsonb)
  into v_actionable_deliveries
  from public.lifecycle_email_deliveries
  where status = 'failed'
     or (status = 'pending' and updated_at <= now() - interval '15 minutes');

  with expected(trigger_name, table_name) as (values
    ('guard_match_status_graph', 'matches'),
    ('guard_planned_match_status_graph', 'planned_matches'),
    ('guard_planned_result_status_graph', 'planned_match_results'),
    ('scoring_version_matches', 'matches'),
    ('scoring_version_placements', 'tournament_placements'),
    ('scoring_version_practice', 'practice_sessions'),
    ('scoring_version_play_days', 'play_days'),
    ('matches_notification_fanout', 'matches'),
    ('planned_results_notification_fanout', 'planned_match_results'),
    ('matches_untagged_notification', 'matches')
  )
  select jsonb_object_agg(expected.trigger_name, exists(
    select 1
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where trigger_row.tgname = expected.trigger_name
      and relation.relname = expected.table_name
      and namespace.nspname = 'public'
      and not trigger_row.tgisinternal
  )) into v_triggers
  from expected;

  select exists(
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) into v_realtime;

  return jsonb_build_object(
    'generatedAt', now(),
    'cache', coalesce(v_cache, jsonb_build_object(
      'factVersion', 0, 'builtVersion', 0, 'drift', 0, 'rebuiltAt', null
    )),
    'integrityIssues', v_integrity,
    'deliveryCounts', v_delivery_counts,
    'actionableDeliveries', v_actionable_deliveries,
    'infrastructure', jsonb_build_object(
      'triggers', v_triggers,
      'notificationsRealtime', v_realtime
    )
  );
end;
$$;

revoke all on function public.core_backend_health_v1() from public;
grant execute on function public.core_backend_health_v1() to authenticated;

comment on function public.core_backend_health_v1() is
  'Returns a privacy-safe organiser health snapshot for core scoring, lifecycle, delivery, trigger, and Realtime contracts.';
