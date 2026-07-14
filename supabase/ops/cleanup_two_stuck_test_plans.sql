-- DESTRUCTIVE OPERATOR SCRIPT. Run only after the ADR-0033 migrations and
-- after matching both IDs against planned_match_workflow_audit.sql.
-- The empty default deliberately aborts; paste exactly two confirmed test IDs.
begin;

do $$
declare
  v_ids uuid[] := array[]::uuid[]; -- replace with array['id-1','id-2']::uuid[]
  v_count int;
begin
  if cardinality(v_ids) <> 2 then raise exception 'Refusing cleanup: provide exactly two planned-match IDs'; end if;
  perform 1 from public.planned_matches where id=any(v_ids) for update;
  select count(*) into v_count from public.planned_matches where id=any(v_ids);
  if v_count <> 2 then raise exception 'Refusing cleanup: both planned matches must exist'; end if;
  if exists(select 1 from public.matches where planned_match_id=any(v_ids) and status='approved') then
    raise exception 'Refusing cleanup: an approved immutable match is linked';
  end if;

  delete from public.matches where planned_match_id=any(v_ids) and status<>'approved';
  delete from public.planned_matches where id=any(v_ids);

  if exists(select 1 from public.matches where planned_match_id=any(v_ids))
     or exists(select 1 from public.planned_match_results where planned_match_id=any(v_ids))
     or exists(select 1 from public.notifications where planned_match_id=any(v_ids)) then
    raise exception 'Cleanup invariant failed; transaction will roll back';
  end if;
end;
$$;

commit;
