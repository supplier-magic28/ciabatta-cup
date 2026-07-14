-- Audited organiser match logging without participant approval (ADR-0034).
alter table public.matches
  add column admin_logged_by uuid references public.players(id) on delete restrict;

create index matches_admin_logged_by_idx on public.matches(admin_logged_by)
where admin_logged_by is not null;

create or replace function public.admin_log_match_v1(
  p_player1_id uuid,
  p_player2_id uuid,
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
declare
  v_actor uuid := auth.uid();
  v_match_id uuid;
  v_player1_set_wins int;
  v_player2_set_wins int;
  v_valid_set_count int;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'only organisers may directly log matches';
  end if;
  if p_player1_id is null or p_player2_id is null or p_player1_id = p_player2_id then
    raise exception 'two distinct participants are required';
  end if;
  if not exists(select 1 from public.players where id=p_player1_id and status='active')
     or not exists(select 1 from public.players where id=p_player2_id and status='active') then
    raise exception 'active participants are required';
  end if;
  if p_match_type not in ('ranked','exhibition')
     or p_winner_player_id not in (p_player1_id,p_player2_id) then
    raise exception 'invalid match result';
  end if;
  if p_format = 'custom' and nullif(btrim(p_format_note),'') is null then
    raise exception 'custom format requires a note';
  end if;
  if p_played_at is null or (p_played_at at time zone 'Australia/Melbourne')::date > (now() at time zone 'Australia/Melbourne')::date then
    raise exception 'match date cannot be in the future';
  end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 7 then
    raise exception 'invalid score';
  end if;

  select
    count(*) filter (where s.p1_games > s.p2_games),
    count(*) filter (where s.p2_games > s.p1_games),
    count(*) filter (
      where s.set_number between 1 and 7
        and s.p1_games between 0 and 30
        and s.p2_games between 0 and 30
        and s.p1_games <> s.p2_games
        and (s.tiebreak_p1 is null) = (s.tiebreak_p2 is null)
        and coalesce(s.tiebreak_p1 between 0 and 99, true)
        and coalesce(s.tiebreak_p2 between 0 and 99, true)
    )
  into v_player1_set_wins, v_player2_set_wins, v_valid_set_count
  from jsonb_to_recordset(p_sets) s(
    set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int
  );

  if v_valid_set_count <> jsonb_array_length(p_sets)
     or v_player1_set_wins = v_player2_set_wins
     or (p_winner_player_id = p_player1_id and v_player1_set_wins < v_player2_set_wins)
     or (p_winner_player_id = p_player2_id and v_player2_set_wins < v_player1_set_wins) then
    raise exception 'score must contain valid sets and agree with the winner';
  end if;

  -- The transient status lets score rows be inserted before the immutable fact
  -- is sealed. admin_logged_by suppresses the participant-confirmation fan-out.
  insert into public.matches(
    type,format,format_note,player1_id,player2_id,winner_id,status,
    submitted_by,admin_logged_by,played_at,location,court_id,surface
  ) values (
    p_match_type,p_format,
    case when p_format='custom' then nullif(btrim(p_format_note),'') else null end,
    p_player1_id,p_player2_id,p_winner_player_id,'pending_confirmation',
    p_player1_id,v_actor,p_played_at,nullif(btrim(p_location),''),p_court_id,p_surface
  ) returning id into v_match_id;

  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_match_id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2
  from jsonb_to_recordset(p_sets) s(
    set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int
  );

  update public.matches set status='approved' where id=v_match_id;
  return v_match_id;
end;
$$;

revoke all on function public.admin_log_match_v1(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
grant execute on function public.admin_log_match_v1(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;

create or replace function public.notify_match_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind public.notification_kind; v_body text;
begin
  if new.status='pending_confirmation' and new.player2_id is not null and new.tournament_id is null and new.planned_match_id is null
     and new.admin_logged_by is null
     and (tg_op='INSERT' or old.status='queried') then
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    values(new.player2_id,'match_confirmation_required',new.id,'A match result is waiting for your confirmation.','/matches','match:'||new.id||':confirmation:'||new.updated_at)
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if new.status='pending_approval' and new.tournament_id is null and new.admin_logged_by is null
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(player_id,kind,match_id,planned_match_id,body,target_path,dedupe_key)
    select id,'match_awaiting_admin_approval',new.id,new.planned_match_id,'A ranked match is waiting for organiser approval.','/admin/approvals?kind=matches','match:'||new.id||':admin_approval'
    from public.players where role='admin' and status='active'
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status
     and (new.planned_match_id is null or new.status in ('queried','rejected'))
     and new.status in ('approved','queried','rejected') then
    v_kind := case new.status when 'approved' then 'match_approved' when 'queried' then 'match_queried' else 'match_rejected' end;
    v_body := case
      when new.status='approved' and new.admin_logged_by is not null then 'An organiser logged and approved your match.'
      when new.status='approved' then 'Your match result was approved.'
      when new.status='queried' then 'Your match result needs a correction.'
      else 'Your match result was rejected.' end;
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    select recipient,v_kind,new.id,v_body,'/matches','match:'||new.id||':'||new.status
    from unnest(array[new.player1_id,new.player2_id]) recipient where recipient is not null
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if; return new;
end; $$;

comment on column public.matches.admin_logged_by is
  'Organiser who directly logged this approved match without participant confirmation.';
comment on function public.admin_log_match_v1(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) is
  'Atomically records and approves an audited organiser-entered member match.';
