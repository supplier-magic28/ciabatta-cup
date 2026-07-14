-- Enforcement half of ADR-0036. Apply only after the application is deployed
-- against the additive RPCs in 20260718120000.

create or replace function public.guard_match_status_graph_v1()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
    (old.status='pending_confirmation' and new.status in ('pending_approval','approved'))
    or (old.status='pending_approval' and new.status in ('approved','queried','rejected'))
    or (old.status='queried' and new.status='pending_confirmation')
  ) then
    raise exception 'invalid match lifecycle transition: % -> %',old.status,new.status;
  end if;
  return new;
end;
$$;
create trigger guard_match_status_graph before update of status on public.matches
for each row execute function public.guard_match_status_graph_v1();

create or replace function public.guard_planned_match_status_graph_v1()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
    (old.status='proposed' and new.status in ('locked_in','declined','cancelled'))
    or (old.status='locked_in' and new.status in ('awaiting_result_approval','confirmed','cancelled'))
    or (old.status='awaiting_result_approval' and new.status in ('awaiting_result_correction','awaiting_admin_approval','confirmed'))
    or (old.status='awaiting_result_correction' and new.status='awaiting_result_approval')
    or (old.status='awaiting_admin_approval' and new.status in ('awaiting_result_correction','confirmed','cancelled'))
  ) then
    raise exception 'invalid planned-match lifecycle transition: % -> %',old.status,new.status;
  end if;
  return new;
end;
$$;
create trigger guard_planned_match_status_graph before update of status on public.planned_matches
for each row execute function public.guard_planned_match_status_graph_v1();

create or replace function public.guard_planned_result_status_graph_v1()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
    (old.status='pending' and new.status in ('approved','queried','superseded'))
    or (old.status='approved' and new.status in ('queried','superseded'))
    or (old.status='queried' and new.status='superseded')
  ) then
    raise exception 'invalid planned-result lifecycle transition: % -> %',old.status,new.status;
  end if;
  return new;
end;
$$;
create trigger guard_planned_result_status_graph before update of status on public.planned_match_results
for each row execute function public.guard_planned_result_status_graph_v1();

-- Authenticated callers now mutate lifecycle rows only through guarded RPCs.
drop policy if exists "matches_insert_participant" on public.matches;
drop policy if exists "matches_insert_admin" on public.matches;
drop policy if exists "matches_update_submitter" on public.matches;
drop policy if exists "matches_update_admin" on public.matches;
drop policy if exists "matches_delete_submitter" on public.matches;
drop policy if exists "matches_delete_admin" on public.matches;
drop policy if exists "match_sets_modify" on public.match_sets;
drop policy if exists "match_confirmations_insert_own" on public.match_confirmations;
drop policy if exists "match_confirmations_admin" on public.match_confirmations;
drop policy if exists "planned_matches_owner_insert" on public.planned_matches;
drop policy if exists "planned_matches_participant_update" on public.planned_matches;
drop policy if exists "notifications_owner_update" on public.notifications;
drop policy if exists "practice_admin_update" on public.practice_sessions;

revoke execute on function public.submit_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from authenticated;
revoke execute on function public.admin_log_match_v1(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from authenticated;
revoke execute on function public.log_external_match(text,boolean,public.match_format,text,boolean,timestamptz,text,jsonb) from authenticated;
revoke execute on function public.record_external_planned_result_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) from authenticated;
revoke execute on function public.resubmit_queried_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from authenticated;

revoke all on function public.guard_match_status_graph_v1() from public;
revoke all on function public.guard_planned_match_status_graph_v1() from public;
revoke all on function public.guard_planned_result_status_graph_v1() from public;

comment on function public.guard_match_status_graph_v1() is 'Rejects lifecycle jumps even for privileged callers; same-state metadata updates remain valid.';
