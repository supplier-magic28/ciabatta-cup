-- Atomic planned-result workflows and complete Zeus approval notifications (ADR-0033).

create or replace function public.guard_reviewed_planned_result_metadata()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' and not (
    public.is_admin()
    and new.status in ('queried','superseded')
    and (to_jsonb(new) - 'status' - 'reviewed_at' - 'court_id')
      is not distinct from (to_jsonb(old) - 'status' - 'reviewed_at' - 'court_id')
  ) and (to_jsonb(new) - 'court_id') is distinct from (to_jsonb(old) - 'court_id') then
    raise exception 'Reviewed result proposals are immutable except for an audited organiser supersession';
  end if;
  return new;
end;
$$;

create or replace function public.submit_planned_result_v2(
  p_planned_match_id uuid,
  p_match_type public.match_type,
  p_format public.match_format,
  p_format_note text,
  p_winner_player_id uuid,
  p_score jsonb,
  p_played_at timestamptz,
  p_location text,
  p_court_id uuid,
  p_surface public.surface
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.planned_matches%rowtype;
  v_existing uuid;
  v_result_id uuid;
begin
  select * into v_plan from public.planned_matches where id = p_planned_match_id for update;
  if not found or v_actor is null then raise exception 'planned match not found'; end if;
  if v_actor not in (v_plan.created_by, v_plan.opponent_player_id) then raise exception 'only participants may report this result'; end if;

  select id into v_existing from public.planned_match_results
   where planned_match_id = v_plan.id and status = 'pending'
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  if v_plan.status <> 'locked_in' then raise exception 'planned match is not ready for a result'; end if;
  if now() < v_plan.scheduled_at then raise exception 'the scheduled match time has not passed'; end if;
  if v_plan.opponent_player_id is null then raise exception 'external plans use the external result workflow'; end if;
  if p_match_type not in ('ranked', 'exhibition') then raise exception 'choose ranked or exhibition'; end if;
  if p_winner_player_id not in (v_plan.created_by, v_plan.opponent_player_id) then raise exception 'winner must be a participant'; end if;
  if jsonb_typeof(p_score) <> 'array' or jsonb_array_length(p_score) not between 1 and 7 then raise exception 'invalid score'; end if;

  insert into public.planned_match_results(
    planned_match_id, submitted_by, match_type, format, format_note,
    winner_player_id, score, played_at, location, court_id, surface, status
  ) values (
    v_plan.id, v_actor, p_match_type, p_format,
    case when p_format = 'custom' then nullif(btrim(p_format_note), '') else null end,
    p_winner_player_id, p_score, p_played_at, nullif(btrim(p_location), ''),
    p_court_id, p_surface, 'pending'
  ) returning id into v_result_id;

  update public.planned_matches set status = 'awaiting_result_approval' where id = v_plan.id;
  return v_result_id;
end;
$$;

create or replace function public.submit_match_v2(
  p_opponent_id uuid,
  p_match_type public.match_type,
  p_format public.match_format,
  p_format_note text,
  p_winner_player_id uuid,
  p_played_at timestamptz,
  p_location text,
  p_court_id uuid,
  p_surface public.surface,
  p_sets jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid:=auth.uid(); v_match_id uuid;
begin
  if v_actor is null or v_actor=p_opponent_id then raise exception 'two participants are required'; end if;
  if not exists(select 1 from public.players where id=v_actor and status='active') or not exists(select 1 from public.players where id=p_opponent_id and status='active') then raise exception 'active participants are required'; end if;
  if p_match_type not in ('ranked','exhibition') or p_winner_player_id not in (v_actor,p_opponent_id) then raise exception 'invalid match result'; end if;
  if jsonb_typeof(p_sets)<>'array' or jsonb_array_length(p_sets) not between 1 and 7 then raise exception 'invalid score'; end if;
  insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,status,submitted_by,played_at,location,court_id,surface)
  values(p_match_type,p_format,case when p_format='custom' then nullif(btrim(p_format_note),'') else null end,v_actor,p_opponent_id,p_winner_player_id,'pending_confirmation',v_actor,p_played_at,nullif(btrim(p_location),''),p_court_id,p_surface)
  returning id into v_match_id;
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_match_id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2
  from jsonb_to_recordset(p_sets) s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
  insert into public.match_confirmations(match_id,player_id) values(v_match_id,v_actor);
  return v_match_id;
end;
$$;

create or replace function public.approve_planned_result_v2(p_planned_match_id uuid)
returns table(match_id uuid, match_status public.match_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.planned_matches%rowtype;
  v_result public.planned_match_results%rowtype;
  v_match_id uuid;
  v_status public.match_status;
begin
  select * into v_plan from public.planned_matches where id = p_planned_match_id for update;
  if not found or v_actor is null then raise exception 'planned match not found'; end if;
  if v_actor not in (v_plan.created_by, v_plan.opponent_player_id) then raise exception 'only participants may approve this result'; end if;

  if v_plan.status in ('awaiting_admin_approval', 'confirmed') then
    select id, status into v_match_id, v_status from public.matches where planned_match_id = v_plan.id;
    return query select v_match_id, v_status;
    return;
  end if;
  if v_plan.status <> 'awaiting_result_approval' then raise exception 'result is not awaiting approval'; end if;

  select * into v_result from public.planned_match_results
   where planned_match_id = v_plan.id and status = 'pending'
   order by created_at desc limit 1 for update;
  if not found or v_result.submitted_by = v_actor then raise exception 'the other participant must approve this result'; end if;

  v_status := case when v_result.match_type = 'ranked' then 'pending_approval'::public.match_status else 'pending_confirmation'::public.match_status end;
  insert into public.matches(
    type, format, format_note, player1_id, player2_id, winner_id, status,
    submitted_by, played_at, location, court_id, surface, planned_match_id
  ) values (
    v_result.match_type, v_result.format, v_result.format_note,
    v_plan.created_by, v_plan.opponent_player_id, v_result.winner_player_id,
    v_status, v_result.submitted_by, v_result.played_at, v_result.location,
    v_result.court_id, v_result.surface, v_plan.id
  ) returning id into v_match_id;

  insert into public.match_sets(match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)
  select v_match_id, s."setNumber",
    case when v_result.submitted_by = v_plan.created_by then s."selfGames" else s."opponentGames" end,
    case when v_result.submitted_by = v_plan.created_by then s."opponentGames" else s."selfGames" end,
    case when v_result.submitted_by = v_plan.created_by then s."selfTiebreak" else s."opponentTiebreak" end,
    case when v_result.submitted_by = v_plan.created_by then s."opponentTiebreak" else s."selfTiebreak" end
  from jsonb_to_recordset(v_result.score) as s(
    "setNumber" int, "selfGames" int, "opponentGames" int,
    "selfTiebreak" int, "opponentTiebreak" int
  );

  if v_result.match_type = 'exhibition' then
    update public.matches set status = 'approved' where id = v_match_id;
    v_status := 'approved';
  end if;
  update public.planned_match_results set status = 'approved', reviewed_at = now() where id = v_result.id;
  update public.planned_matches
     set status = case when v_status = 'approved' then 'confirmed' else 'awaiting_admin_approval' end
   where id = v_plan.id;

  return query select v_match_id, v_status;
end;
$$;

create or replace function public.request_planned_result_correction_v2(p_planned_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.planned_matches%rowtype;
  v_result public.planned_match_results%rowtype;
begin
  select * into v_plan from public.planned_matches where id = p_planned_match_id for update;
  if not found or v_actor not in (v_plan.created_by, v_plan.opponent_player_id) then raise exception 'only participants may query this result'; end if;
  if v_plan.status <> 'awaiting_result_approval' then raise exception 'result is not awaiting participant approval'; end if;
  select * into v_result from public.planned_match_results
   where planned_match_id = v_plan.id and status = 'pending'
   order by created_at desc limit 1 for update;
  if not found or v_result.submitted_by = v_actor then raise exception 'the reviewing participant must query this result'; end if;
  update public.planned_match_results set status = 'queried', reviewed_at = now() where id = v_result.id;
  update public.planned_matches set status = 'awaiting_result_correction' where id = v_plan.id;
end;
$$;

create or replace function public.correct_planned_result_v2(
  p_planned_match_id uuid,
  p_match_type public.match_type,
  p_format public.match_format,
  p_format_note text,
  p_winner_player_id uuid,
  p_score jsonb,
  p_played_at timestamptz,
  p_location text,
  p_court_id uuid,
  p_surface public.surface
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.planned_matches%rowtype;
  v_prior public.planned_match_results%rowtype;
  v_linked public.matches%rowtype;
  v_result_id uuid;
begin
  if not public.is_admin() then raise exception 'only organisers may correct results'; end if;
  select * into v_plan from public.planned_matches where id = p_planned_match_id for update;
  if not found or v_plan.status not in ('awaiting_result_correction', 'awaiting_admin_approval') then raise exception 'planned result is not correctable'; end if;

  select * into v_prior from public.planned_match_results
   where planned_match_id = v_plan.id order by created_at desc limit 1 for update;
  if not found then raise exception 'result proposal not found'; end if;
  select * into v_linked from public.matches where planned_match_id = v_plan.id for update;
  if found then
    if v_linked.status = 'approved' then raise exception 'approved match facts cannot be corrected'; end if;
    delete from public.matches where id = v_linked.id;
  end if;

  update public.planned_match_results set status = 'superseded' where id = v_prior.id;
  insert into public.planned_match_results(
    planned_match_id, submitted_by, match_type, format, format_note,
    winner_player_id, score, played_at, location, court_id, surface,
    status, supersedes_id, corrected_by
  ) values (
    v_plan.id, v_prior.submitted_by, p_match_type, p_format,
    case when p_format = 'custom' then nullif(btrim(p_format_note), '') else null end,
    p_winner_player_id, p_score, p_played_at, nullif(btrim(p_location), ''),
    p_court_id, p_surface, 'pending', v_prior.id, v_actor
  ) returning id into v_result_id;
  update public.planned_matches set status = 'awaiting_result_approval' where id = v_plan.id;
  return v_result_id;
end;
$$;

create or replace function public.record_external_planned_result_v2(
  p_planned_match_id uuid,
  p_opponent_name text,
  p_save_opponent boolean,
  p_format public.match_format,
  p_format_note text,
  p_external_won boolean,
  p_played_at timestamptz,
  p_location text,
  p_court_id uuid,
  p_surface public.surface,
  p_sets jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.planned_matches%rowtype;
  v_name text := btrim(p_opponent_name);
  v_opponent_id uuid;
  v_match_id uuid;
begin
  select * into v_plan from public.planned_matches where id = p_planned_match_id for update;
  if not found or v_actor is null or v_plan.created_by <> v_actor or v_plan.opponent_external_id is null then raise exception 'external plan not found'; end if;
  select id into v_match_id from public.matches where planned_match_id = v_plan.id;
  if v_match_id is not null then return v_match_id; end if;
  if v_plan.status <> 'locked_in' or now() < v_plan.scheduled_at then raise exception 'planned match is not ready for a result'; end if;
  if char_length(v_name) not between 1 and 100 then raise exception 'opponent name is invalid'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 7 then raise exception 'invalid score'; end if;

  if p_save_opponent then
    insert into public.external_opponents(owner_id, display_name) values(v_actor, v_name)
    on conflict do nothing returning id into v_opponent_id;
    if v_opponent_id is null then select id into v_opponent_id from public.external_opponents where owner_id = v_actor and lower(btrim(display_name)) = lower(v_name); end if;
  end if;

  insert into public.matches(
    type, format, format_note, player1_id, player2_id, winner_id, external_won,
    status, submitted_by, played_at, location, court_id, surface, planned_match_id
  ) values (
    'unranked_external', p_format,
    case when p_format = 'custom' then nullif(btrim(p_format_note), '') else null end,
    v_actor, null, case when p_external_won then null else v_actor end, p_external_won,
    'pending_confirmation', v_actor, p_played_at, nullif(btrim(p_location), ''),
    p_court_id, p_surface, v_plan.id
  ) returning id into v_match_id;
  insert into public.external_match_details(match_id, owner_id, external_opponent_id, opponent_name)
  values(v_match_id, v_actor, v_opponent_id, v_name);
  insert into public.match_sets(match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)
  select v_match_id, s.set_number, s.p1_games, s.p2_games, s.tiebreak_p1, s.tiebreak_p2
  from jsonb_to_recordset(p_sets) s(set_number int, p1_games int, p2_games int, tiebreak_p1 int, tiebreak_p2 int);
  update public.matches set status = 'approved' where id = v_match_id;
  update public.planned_matches set status = 'confirmed' where id = v_plan.id;
  return v_match_id;
end;
$$;

create or replace function public.review_match_v2(p_match_id uuid, p_decision text)
returns public.match_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_next public.match_status;
begin
  if not public.is_admin() then raise exception 'only organisers may review matches'; end if;
  if p_decision not in ('approved', 'queried', 'rejected') then raise exception 'invalid review decision'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.status <> 'pending_approval' then raise exception 'match is not awaiting approval'; end if;

  if p_decision = 'queried' and v_match.planned_match_id is not null then
    update public.planned_match_results set status = 'queried', reviewed_at = now()
     where planned_match_id = v_match.planned_match_id and status = 'approved';
    update public.planned_matches set status = 'awaiting_result_correction' where id = v_match.planned_match_id;
    delete from public.matches where id = v_match.id;
    return 'queried';
  end if;

  v_next := p_decision::public.match_status;
  update public.matches set status = v_next where id = v_match.id;
  if v_match.planned_match_id is not null then
    update public.planned_matches
       set status = case when v_next = 'approved' then 'confirmed'::public.planned_match_status else 'cancelled'::public.planned_match_status end
     where id = v_match.planned_match_id;
  end if;
  return v_next;
end;
$$;

create or replace function public.resubmit_queried_match_v2(
  p_match_id uuid,
  p_match_type public.match_type,
  p_format public.match_format,
  p_format_note text,
  p_winner_player_id uuid,
  p_played_at timestamptz,
  p_location text,
  p_court_id uuid,
  p_surface public.surface,
  p_sets jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid:=auth.uid(); v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found or v_match.status<>'queried' or v_match.submitted_by<>v_actor or v_match.planned_match_id is not null then raise exception 'queried match is not editable'; end if;
  if p_winner_player_id not in (v_match.player1_id,v_match.player2_id) then raise exception 'winner must be a participant'; end if;
  delete from public.match_confirmations where match_id=v_match.id;
  delete from public.match_sets where match_id=v_match.id;
  update public.matches set type=p_match_type,format=p_format,
    format_note=case when p_format='custom' then nullif(btrim(p_format_note),'') else null end,
    winner_id=p_winner_player_id,played_at=p_played_at,location=nullif(btrim(p_location),''),
    court_id=p_court_id,surface=p_surface,status='pending_confirmation'
  where id=v_match.id;
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_match.id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2
  from jsonb_to_recordset(p_sets) s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
  insert into public.match_confirmations(match_id,player_id) values(v_match.id,v_actor);
  return v_match.id;
end;
$$;

revoke all on function public.submit_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) from public;
revoke all on function public.submit_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.approve_planned_result_v2(uuid) from public;
revoke all on function public.request_planned_result_correction_v2(uuid) from public;
revoke all on function public.correct_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) from public;
revoke all on function public.record_external_planned_result_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.review_match_v2(uuid,text) from public;
revoke all on function public.resubmit_queried_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
grant execute on function public.submit_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) to authenticated;
grant execute on function public.submit_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.approve_planned_result_v2(uuid) to authenticated;
grant execute on function public.request_planned_result_correction_v2(uuid) to authenticated;
grant execute on function public.correct_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) to authenticated;
grant execute on function public.record_external_planned_result_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.review_match_v2(uuid,text) to authenticated;
grant execute on function public.resubmit_queried_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;

create or replace function public.notify_planned_match_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recipient uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'proposed' and new.opponent_player_id is not null then
      insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
      values(new.opponent_player_id,'match_proposed',new.id,'A match proposal is waiting for your answer.','/matches/'||new.id,'planned:'||new.id||':match_proposed')
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    end if; return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if old.status='proposed' and new.status='locked_in' then
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    values(new.created_by,'match_locked_in',new.id,'Your proposed match is locked in.','/matches/'||new.id,'planned:'||new.id||':match_locked_in')
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif old.status='proposed' and new.status='declined' then
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    values(new.created_by,'match_declined',new.id,'Your proposed match was declined.','/matches/'||new.id,'planned:'||new.id||':match_declined')
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif new.status='cancelled' and old.status <> 'awaiting_admin_approval' then
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    select recipient,'match_cancelled',new.id,'Your planned match was cancelled.','/matches/'||new.id,'planned:'||new.id||':match_cancelled:'||recipient
    from unnest(array[new.created_by,new.opponent_player_id]) recipient where recipient is not null and recipient is distinct from new.cancelled_by
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif new.status='confirmed' then
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    select recipient,'result_confirmed',new.id,'Your match result is confirmed.','/matches/'||new.id,'planned:'||new.id||':result_confirmed'
    from unnest(array[new.created_by,new.opponent_player_id]) recipient where recipient is not null
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if; return new;
end; $$;

create or replace function public.notify_planned_result_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan public.planned_matches%rowtype; v_recipient uuid;
begin
  select * into v_plan from public.planned_matches where id=new.planned_match_id;
  if tg_op='INSERT' and new.status='pending' then
    v_recipient := case when new.submitted_by=v_plan.created_by then v_plan.opponent_player_id else v_plan.created_by end;
    if v_recipient is not null then
      insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
      values(v_recipient,'result_to_approve',v_plan.id,
        case when new.corrected_by is null then 'A match result is waiting for your approval.' else 'A corrected match result is waiting for your approval.' end,
        '/matches/'||v_plan.id,'planned:'||v_plan.id||':result_to_approve:'||new.id)
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  elsif tg_op='UPDATE' and new.status='queried' and old.status is distinct from new.status then
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    values(new.submitted_by,'result_correction_requested',v_plan.id,'Your submitted result needs an organiser correction.','/matches/'||v_plan.id,'planned:'||v_plan.id||':correction:'||new.id)
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
    select id,'result_correction_requested',v_plan.id,'A planned result needs correction.','/admin/approvals?kind=matches','planned:'||v_plan.id||':admin_correction:'||new.id
    from public.players where role='admin' and status='active'
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if; return new;
end; $$;

drop trigger if exists planned_results_notification_fanout on public.planned_match_results;
create trigger planned_results_notification_fanout after insert or update of status on public.planned_match_results
for each row execute function public.notify_planned_result_lifecycle();

create or replace function public.notify_match_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind public.notification_kind; v_body text;
begin
  if new.status='pending_confirmation' and new.player2_id is not null and new.tournament_id is null and new.planned_match_id is null
     and (tg_op='INSERT' or old.status='queried') then
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    values(new.player2_id,'match_confirmation_required',new.id,'A match result is waiting for your confirmation.','/matches','match:'||new.id||':confirmation:'||new.updated_at)
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if new.status='pending_approval' and new.tournament_id is null and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(player_id,kind,match_id,planned_match_id,body,target_path,dedupe_key)
    select id,'match_awaiting_admin_approval',new.id,new.planned_match_id,'A ranked match is waiting for organiser approval.','/admin/approvals?kind=matches','match:'||new.id||':admin_approval'
    from public.players where role='admin' and status='active'
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status
     and (new.planned_match_id is null or new.status in ('queried','rejected'))
     and new.status in ('approved','queried','rejected') then
    v_kind := case new.status when 'approved' then 'match_approved' when 'queried' then 'match_queried' else 'match_rejected' end;
    v_body := case new.status when 'approved' then 'Your match result was approved.' when 'queried' then 'Your match result needs a correction.' else 'Your match result was rejected.' end;
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    select recipient,v_kind,new.id,v_body,'/matches','match:'||new.id||':'||new.status
    from unnest(array[new.player1_id,new.player2_id]) recipient where recipient is not null
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if; return new;
end; $$;

drop trigger if exists matches_notification_fanout on public.matches;
create trigger matches_notification_fanout after insert or update of status on public.matches
for each row execute function public.notify_match_lifecycle();

-- Backfill only current actionable work. Stable keys make this safe to rerun.
insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
select m.player2_id,'match_confirmation_required',m.id,'A match result is waiting for your confirmation.','/matches','match:'||m.id||':confirmation'
from public.matches m where m.status='pending_confirmation' and m.player2_id is not null and m.tournament_id is null and m.planned_match_id is null
on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;

insert into public.notifications(player_id,kind,match_id,planned_match_id,body,target_path,dedupe_key)
select a.id,'match_awaiting_admin_approval',m.id,m.planned_match_id,'A ranked match is waiting for organiser approval.','/admin/approvals?kind=matches','match:'||m.id||':admin_approval'
from public.matches m cross join public.players a where m.status='pending_approval' and m.tournament_id is null and a.role='admin' and a.status='active'
on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;

insert into public.notifications(player_id,kind,planned_match_id,body,target_path,dedupe_key)
select case when r.submitted_by=p.created_by then p.opponent_player_id else p.created_by end,
  'result_to_approve',p.id,'A match result is waiting for your approval.','/matches/'||p.id,'planned:'||p.id||':result_to_approve:'||r.id
from public.planned_matches p join public.planned_match_results r on r.planned_match_id=p.id and r.status='pending'
where p.status='awaiting_result_approval'
on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;

comment on function public.submit_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) is 'Atomically stores a participant-perspective planned result after the scheduled time.';
comment on function public.approve_planned_result_v2(uuid) is 'Atomically materialises a participant-approved proposal with player1-normalised sets.';
comment on function public.review_match_v2(uuid,text) is 'Atomically reviews a ranked match and synchronises any linked planned shell.';
