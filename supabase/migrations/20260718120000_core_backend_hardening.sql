-- Additive reliability contracts for core match workflows (ADR-0036).

alter table public.matches add column if not exists operation_key uuid;
create unique index if not exists matches_operation_key_unique
  on public.matches(operation_key) where operation_key is not null;
alter table public.planned_matches add column if not exists operation_key uuid;
create unique index if not exists planned_matches_operation_key_unique
  on public.planned_matches(operation_key) where operation_key is not null;

create table if not exists public.scoring_cache_state (
  singleton boolean primary key default true check (singleton),
  fact_version bigint not null default 0,
  built_version bigint not null default 0,
  rebuilt_at timestamptz
);
insert into public.scoring_cache_state(singleton) values(true) on conflict do nothing;
alter table public.scoring_cache_state enable row level security;

create table if not exists public.lifecycle_email_deliveries (
  idempotency_key text primary key,
  kind text not null,
  player_id uuid references public.players(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  status text not null check (status in ('pending','sent','failed')),
  attempt_count int not null default 1 check (attempt_count > 0),
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.lifecycle_email_deliveries enable row level security;

-- RLS is the row boundary; explicit table grants make that boundary portable
-- to new Supabase projects where automatic public-schema exposure is disabled.
grant select on public.players,public.matches,public.match_sets,public.match_confirmations,
  public.planned_matches,public.planned_match_results,public.notifications,
  public.practice_sessions,public.courts,public.external_opponents to authenticated;
grant insert on public.practice_sessions to authenticated;
grant select,insert,update on public.lifecycle_email_deliveries to service_role;
grant select,update on public.scoring_cache_state to service_role;

create or replace function public.assert_standard_match_payload_v1(
  p_sets jsonb,
  p_player1_id uuid,
  p_player2_id uuid,
  p_winner_id uuid,
  p_played_at timestamptz,
  p_format public.match_format,
  p_format_note text
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
  v_distinct int;
  v_min int;
  v_max int;
  v_p1_wins int;
  v_p2_wins int;
begin
  if p_player1_id is null or p_player2_id is null or p_player1_id = p_player2_id then
    raise exception 'two distinct participants are required';
  end if;
  if p_winner_id not in (p_player1_id,p_player2_id) then raise exception 'winner must be a participant'; end if;
  if p_played_at is null or (p_played_at at time zone 'Australia/Melbourne')::date > (now() at time zone 'Australia/Melbourne')::date then
    raise exception 'match date cannot be in the future';
  end if;
  if p_format is null or (p_format = 'custom') <> (nullif(btrim(p_format_note),'') is not null) then
    raise exception 'custom formats require a note and standard formats cannot store one';
  end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 7 then raise exception 'enter 1 to 7 sets'; end if;

  select count(*),count(distinct s.set_number),min(s.set_number),max(s.set_number),
    count(*) filter(where s.p1_games>s.p2_games or (s.p1_games=s.p2_games and s.tiebreak_p1>s.tiebreak_p2)),
    count(*) filter(where s.p2_games>s.p1_games or (s.p1_games=s.p2_games and s.tiebreak_p2>s.tiebreak_p1))
  into v_count,v_distinct,v_min,v_max,v_p1_wins,v_p2_wins
  from jsonb_to_recordset(p_sets) s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int)
  where s.set_number is not null and s.p1_games between 0 and 30 and s.p2_games between 0 and 30
    and (s.tiebreak_p1 is null)=(s.tiebreak_p2 is null)
    and coalesce(s.tiebreak_p1 between 0 and 99,true) and coalesce(s.tiebreak_p2 between 0 and 99,true)
    and (s.p1_games<>s.p2_games or (s.tiebreak_p1 is not null and s.tiebreak_p1<>s.tiebreak_p2));
  if v_count<>jsonb_array_length(p_sets) or v_distinct<>v_count or v_min<>1 or v_max<>v_count then raise exception 'sets must be valid and sequential'; end if;
  if v_p1_wins=v_p2_wins or (p_winner_id=p_player1_id and v_p1_wins<v_p2_wins) or (p_winner_id=p_player2_id and v_p2_wins<v_p1_wins) then
    raise exception 'score must agree with the winner';
  end if;
end;
$$;

-- Planned proposals store scores from the submitter's perspective. Normalise
-- them to the shell's canonical player order before applying the same validator
-- used by ordinary, organiser, and external match creation.
create or replace function public.validate_planned_result_payload_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.planned_matches%rowtype;
  v_sets jsonb;
begin
  if jsonb_typeof(new.score) <> 'array' then
    raise exception 'planned score must be an array';
  end if;
  select * into v_plan
  from public.planned_matches
  where id = new.planned_match_id
  for key share;

  if not found or v_plan.opponent_player_id is null then
    raise exception 'member planned match not found';
  end if;
  if new.submitted_by is distinct from v_plan.created_by
     and new.submitted_by is distinct from v_plan.opponent_player_id then
    raise exception 'planned result submitter must be a participant';
  end if;
  if not exists(select 1 from public.players where id=v_plan.created_by and status='active')
     or not exists(select 1 from public.players where id=v_plan.opponent_player_id and status='active') then
    raise exception 'active participants are required';
  end if;
  if new.match_type not in ('ranked','exhibition') then
    raise exception 'choose ranked or exhibition';
  end if;

  select jsonb_agg(jsonb_build_object(
    'set_number', (item->>'setNumber')::int,
    'p1_games', case when new.submitted_by=v_plan.created_by then (item->>'selfGames')::int else (item->>'opponentGames')::int end,
    'p2_games', case when new.submitted_by=v_plan.created_by then (item->>'opponentGames')::int else (item->>'selfGames')::int end,
    'tiebreak_p1', case when new.submitted_by=v_plan.created_by then (item->>'selfTiebreak')::int else (item->>'opponentTiebreak')::int end,
    'tiebreak_p2', case when new.submitted_by=v_plan.created_by then (item->>'opponentTiebreak')::int else (item->>'selfTiebreak')::int end
  ) order by (item->>'setNumber')::int)
  into v_sets
  from jsonb_array_elements(new.score) item;

  perform public.assert_standard_match_payload_v1(
    v_sets, v_plan.created_by, v_plan.opponent_player_id,
    new.winner_player_id, new.played_at, new.format,
    case when new.format='custom' then nullif(btrim(new.format_note),'') else null end
  );
  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'planned score contains invalid values';
end;
$$;

create trigger validate_planned_result_payload
before insert on public.planned_match_results
for each row execute function public.validate_planned_result_payload_v1();

create or replace function public.submit_match_v3(
  p_operation_key uuid,p_opponent_id uuid,p_match_type public.match_type,p_format public.match_format,
  p_format_note text,p_winner_player_id uuid,p_played_at timestamptz,p_location text,p_court_id uuid,
  p_surface public.surface,p_sets jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_note text:=case when p_format='custom' then nullif(btrim(p_format_note),'') else null end;
begin
  if v_actor is null or p_operation_key is null then raise exception 'authenticated operation key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_key::text,0));
  select id into v_id from public.matches where operation_key=p_operation_key;
  if found then if not exists(select 1 from public.matches where id=v_id and submitted_by=v_actor and admin_logged_by is null) then raise exception 'operation key belongs to another actor'; end if; return v_id; end if;
  if not exists(select 1 from public.players where id=v_actor and status='active') or not exists(select 1 from public.players where id=p_opponent_id and status='active') then raise exception 'active participants are required'; end if;
  if p_match_type not in ('ranked','exhibition') then raise exception 'choose ranked or exhibition'; end if;
  perform public.assert_standard_match_payload_v1(p_sets,v_actor,p_opponent_id,p_winner_player_id,p_played_at,p_format,v_note);
  insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,status,submitted_by,played_at,location,court_id,surface,operation_key)
  values(p_match_type,p_format,v_note,v_actor,p_opponent_id,p_winner_player_id,'pending_confirmation',v_actor,p_played_at,nullif(btrim(p_location),''),p_court_id,p_surface,p_operation_key) returning id into v_id;
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
  insert into public.match_confirmations(match_id,player_id) values(v_id,v_actor);
  return v_id;
end;$$;

create or replace function public.record_external_planned_result_v3(
  p_planned_match_id uuid,p_opponent_name text,p_save_opponent boolean,
  p_format public.match_format,p_format_note text,p_external_won boolean,
  p_played_at timestamptz,p_location text,p_court_id uuid,p_surface public.surface,p_sets jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_external constant uuid:='00000000-0000-0000-0000-000000000001'::uuid;
  v_winner uuid:=case when p_external_won then v_external else v_actor end;
begin
  perform public.assert_standard_match_payload_v1(
    p_sets,v_actor,v_external,v_winner,p_played_at,p_format,
    case when p_format='custom' then nullif(btrim(p_format_note),'') else null end
  );
  return public.record_external_planned_result_v2(
    p_planned_match_id,p_opponent_name,p_save_opponent,p_format,p_format_note,
    p_external_won,p_played_at,p_location,p_court_id,p_surface,p_sets
  );
end;
$$;

create or replace function public.resubmit_queried_match_v3(
  p_match_id uuid,p_match_type public.match_type,p_format public.match_format,p_format_note text,
  p_winner_player_id uuid,p_played_at timestamptz,p_location text,p_court_id uuid,
  p_surface public.surface,p_sets jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'queried match not found'; end if;
  if p_match_type not in ('ranked','exhibition') then raise exception 'choose ranked or exhibition'; end if;
  perform public.assert_standard_match_payload_v1(
    p_sets,v_match.player1_id,v_match.player2_id,p_winner_player_id,p_played_at,p_format,
    case when p_format='custom' then nullif(btrim(p_format_note),'') else null end
  );
  return public.resubmit_queried_match_v2(
    p_match_id,p_match_type,p_format,p_format_note,p_winner_player_id,p_played_at,
    p_location,p_court_id,p_surface,p_sets
  );
end;
$$;

create or replace function public.admin_log_match_v2(
  p_operation_key uuid,p_player1_id uuid,p_player2_id uuid,p_match_type public.match_type,p_format public.match_format,
  p_format_note text,p_winner_player_id uuid,p_played_at timestamptz,p_location text,p_court_id uuid,
  p_surface public.surface,p_sets jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_note text:=case when p_format='custom' then nullif(btrim(p_format_note),'') else null end;
begin
  if v_actor is null or not public.is_admin() or p_operation_key is null then raise exception 'only organisers may directly log matches'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_key::text,0));
  select id into v_id from public.matches where operation_key=p_operation_key;
  if found then if not exists(select 1 from public.matches where id=v_id and admin_logged_by=v_actor) then raise exception 'operation key belongs to another actor'; end if; return v_id; end if;
  if not exists(select 1 from public.players where id=p_player1_id and status='active') or not exists(select 1 from public.players where id=p_player2_id and status='active') then raise exception 'active participants are required'; end if;
  if p_match_type not in ('ranked','exhibition') then raise exception 'choose ranked or exhibition'; end if;
  perform public.assert_standard_match_payload_v1(p_sets,p_player1_id,p_player2_id,p_winner_player_id,p_played_at,p_format,v_note);
  insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,status,submitted_by,admin_logged_by,played_at,location,court_id,surface,operation_key)
  values(p_match_type,p_format,v_note,p_player1_id,p_player2_id,p_winner_player_id,'pending_confirmation',p_player1_id,v_actor,p_played_at,nullif(btrim(p_location),''),p_court_id,p_surface,p_operation_key) returning id into v_id;
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
  update public.matches set status='approved' where id=v_id;
  return v_id;
end;$$;

create or replace function public.log_external_match_v2(
  p_operation_key uuid,p_opponent_name text,p_save_opponent boolean,p_format public.match_format,p_format_note text,
  p_external_won boolean,p_played_at timestamptz,p_location text,p_court_id uuid,p_surface public.surface,p_sets jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_external uuid:='00000000-0000-0000-0000-000000000001'::uuid;v_name text:=btrim(p_opponent_name);v_saved uuid;v_winner uuid;v_note text:=case when p_format='custom' then nullif(btrim(p_format_note),'') else null end;
begin
  if v_actor is null or p_operation_key is null or not exists(select 1 from public.players where id=v_actor and status='active') then raise exception 'active player and operation key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_key::text,0));
  select id into v_id from public.matches where operation_key=p_operation_key;
  if found then if not exists(select 1 from public.matches where id=v_id and submitted_by=v_actor and type='unranked_external') then raise exception 'operation key belongs to another actor'; end if; return v_id; end if;
  if char_length(v_name) not between 1 and 100 then raise exception 'opponent name is invalid'; end if;
  v_winner:=case when p_external_won then v_external else v_actor end;
  perform public.assert_standard_match_payload_v1(p_sets,v_actor,v_external,v_winner,p_played_at,p_format,v_note);
  if p_save_opponent then insert into public.external_opponents(owner_id,display_name) values(v_actor,v_name) on conflict do nothing returning id into v_saved; if v_saved is null then select id into v_saved from public.external_opponents where owner_id=v_actor and lower(btrim(display_name))=lower(v_name); end if; end if;
  insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,external_won,status,submitted_by,played_at,location,court_id,surface,operation_key)
  values('unranked_external',p_format,v_note,v_actor,null,case when p_external_won then null else v_actor end,p_external_won,'pending_confirmation',v_actor,p_played_at,nullif(btrim(p_location),''),p_court_id,p_surface,p_operation_key) returning id into v_id;
  insert into public.external_match_details(match_id,owner_id,external_opponent_id,opponent_name)values(v_id,v_actor,v_saved,v_name);
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)select v_id,s.set_number,s.p1_games,s.p2_games,s.tiebreak_p1,s.tiebreak_p2 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
  update public.matches set status='approved' where id=v_id;return v_id;
end;$$;

create or replace function public.create_planned_match_v1(p_operation_key uuid,p_opponent_player_id uuid,p_opponent_external_id uuid,p_scheduled_at timestamptz,p_location text,p_court_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_external boolean:=p_opponent_external_id is not null;
begin
  if v_actor is null or p_operation_key is null then raise exception 'authenticated operation key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_key::text,0));
  select id into v_id from public.planned_matches where operation_key=p_operation_key;if found then if not exists(select 1 from public.planned_matches where id=v_id and created_by=v_actor)then raise exception 'operation key belongs to another actor';end if;return v_id;end if;
  if not exists(select 1 from public.players where id=v_actor and status='active')then raise exception 'active creator required';end if;
  if (p_opponent_player_id is null)=(p_opponent_external_id is null) then raise exception 'choose one opponent';end if;
  if p_opponent_player_id=v_actor then raise exception 'choose another player';end if;
  if p_opponent_player_id is not null and not exists(select 1 from public.players where id=p_opponent_player_id and status='active')then raise exception 'active opponent required';end if;
  if p_opponent_external_id is not null and not exists(select 1 from public.external_opponents where id=p_opponent_external_id and owner_id=v_actor)then raise exception 'external opponent not found';end if;
  insert into public.planned_matches(created_by,opponent_player_id,opponent_external_id,scheduled_at,location,court_id,status,accepted_at,operation_key)
  values(v_actor,p_opponent_player_id,p_opponent_external_id,p_scheduled_at,coalesce(nullif(btrim(p_location),''),''),p_court_id,(case when v_external then 'locked_in' else 'proposed' end)::public.planned_match_status,case when v_external then now() else null end,p_operation_key)returning id into v_id;return v_id;
end;$$;

create or replace function public.respond_planned_match_v1(p_planned_match_id uuid,p_decision text)
returns public.planned_match_status language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_plan public.planned_matches%rowtype;v_next public.planned_match_status;
begin
  select * into v_plan from public.planned_matches where id=p_planned_match_id for update;if not found or v_actor is null then raise exception 'planned match not found';end if;
  if p_decision='accept' then if v_actor<>v_plan.opponent_player_id then raise exception 'only the invited player may accept';end if;v_next:='locked_in';
  elsif p_decision='decline' then if v_actor<>v_plan.opponent_player_id then raise exception 'only the invited player may decline';end if;v_next:='declined';
  elsif p_decision='cancel' then if v_actor is distinct from v_plan.created_by and v_actor is distinct from v_plan.opponent_player_id then raise exception 'only participants may cancel';end if;v_next:='cancelled';else raise exception 'invalid decision';end if;
  if v_plan.status=v_next then return v_next;end if;
  if (p_decision in('accept','decline') and v_plan.status<>'proposed')
     or (p_decision='cancel' and v_plan.status not in('proposed','locked_in'))
     or (p_decision='cancel' and v_plan.status='proposed' and v_actor is distinct from v_plan.created_by)
  then raise exception 'planned match transition is no longer available';end if;
  update public.planned_matches set status=v_next,accepted_at=case when v_next='locked_in' then now() else accepted_at end,cancelled_by=case when v_next='cancelled' then v_actor else null end where id=v_plan.id;return v_next;
end;$$;

create or replace function public.confirm_match_v1(p_match_id uuid)
returns public.match_status language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id=p_match_id for update;if not found or v_actor not in(v_match.player1_id,v_match.player2_id)then raise exception 'match not found';end if;
  if exists(select 1 from public.match_confirmations where match_id=v_match.id and player_id=v_actor)then return v_match.status;end if;
  if v_match.status<>'pending_confirmation'then return v_match.status;end if;
  insert into public.match_confirmations(match_id,player_id)values(v_match.id,v_actor)on conflict do nothing;
  select * into v_match from public.matches where id=p_match_id;return v_match.status;
end;$$;

create or replace function public.review_practice_v1(p_practice_id uuid,p_decision public.practice_status)
returns public.practice_status language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_row public.practice_sessions%rowtype;
begin
  if not public.is_admin() or p_decision not in('approved','rejected')then raise exception 'only organisers may review practice';end if;
  select * into v_row from public.practice_sessions where id=p_practice_id for update;if not found then raise exception 'practice not found';end if;
  if v_row.status=p_decision then return p_decision;end if;if v_row.status<>'pending'then raise exception 'conflicting terminal review';end if;
  update public.practice_sessions set status=p_decision,reviewed_by=v_actor,reviewed_at=now()where id=p_practice_id;return p_decision;
end;$$;

-- Preserve the ADR-0033 behaviour while making enum outcomes explicit for
-- plpgsql_check and for future PostgreSQL upgrades.
create or replace function public.approve_planned_result_v2(p_planned_match_id uuid)
returns table(match_id uuid, match_status public.match_status)
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_plan public.planned_matches%rowtype;
  v_result public.planned_match_results%rowtype;
  v_match_id uuid;
  v_status public.match_status;
begin
  select * into v_plan from public.planned_matches where id=p_planned_match_id for update;
  if not found or v_actor is null then raise exception 'planned match not found'; end if;
  if v_actor is distinct from v_plan.created_by and v_actor is distinct from v_plan.opponent_player_id then raise exception 'only participants may approve this result'; end if;
  if v_plan.status in ('awaiting_admin_approval','confirmed') then
    select id,status into v_match_id,v_status from public.matches where planned_match_id=v_plan.id;
    return query select v_match_id,v_status; return;
  end if;
  if v_plan.status<>'awaiting_result_approval' then raise exception 'result is not awaiting approval'; end if;
  select * into v_result from public.planned_match_results where planned_match_id=v_plan.id and status='pending' order by created_at desc limit 1 for update;
  if not found or v_result.submitted_by=v_actor then raise exception 'the other participant must approve this result'; end if;
  v_status:=case when v_result.match_type='ranked' then 'pending_approval'::public.match_status else 'pending_confirmation'::public.match_status end;
  insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,status,submitted_by,played_at,location,court_id,surface,planned_match_id)
  values(v_result.match_type,v_result.format,v_result.format_note,v_plan.created_by,v_plan.opponent_player_id,v_result.winner_player_id,v_status,v_result.submitted_by,v_result.played_at,v_result.location,v_result.court_id,v_result.surface,v_plan.id)
  returning id into v_match_id;
  insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
  select v_match_id,s."setNumber",
    case when v_result.submitted_by=v_plan.created_by then s."selfGames" else s."opponentGames" end,
    case when v_result.submitted_by=v_plan.created_by then s."opponentGames" else s."selfGames" end,
    case when v_result.submitted_by=v_plan.created_by then s."selfTiebreak" else s."opponentTiebreak" end,
    case when v_result.submitted_by=v_plan.created_by then s."opponentTiebreak" else s."selfTiebreak" end
  from jsonb_to_recordset(v_result.score) s("setNumber" int,"selfGames" int,"opponentGames" int,"selfTiebreak" int,"opponentTiebreak" int);
  if v_result.match_type='exhibition' then update public.matches set status='approved' where id=v_match_id;v_status:='approved';end if;
  update public.planned_match_results set status='approved',reviewed_at=now() where id=v_result.id;
  update public.planned_matches set status=(case when v_status='approved' then 'confirmed' else 'awaiting_admin_approval' end)::public.planned_match_status where id=v_plan.id;
  return query select v_match_id,v_status;
end;
$$;

create or replace function public.review_match_v2(p_match_id uuid,p_decision text)
returns public.match_status language plpgsql security definer set search_path=''
as $$
declare v_match public.matches%rowtype;v_next public.match_status;
begin
  if not public.is_admin() then raise exception 'only organisers may review matches';end if;
  if p_decision not in('approved','queried','rejected')then raise exception 'invalid review decision';end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match is not awaiting approval';end if;
  if v_match.status=p_decision::public.match_status then return v_match.status;end if;
  if v_match.status in('approved','queried','rejected')then raise exception 'conflicting terminal review';end if;
  if v_match.status<>'pending_approval'then raise exception 'match is not awaiting approval';end if;
  if p_decision='queried' and v_match.planned_match_id is not null then
    update public.planned_match_results set status='queried',reviewed_at=now() where planned_match_id=v_match.planned_match_id and status='approved';
    update public.planned_matches set status='awaiting_result_correction' where id=v_match.planned_match_id;
    update public.matches set status='queried' where id=v_match.id;
    return 'queried'::public.match_status;
  end if;
  v_next:=p_decision::public.match_status;
  update public.matches set status=v_next where id=v_match.id;
  if v_match.planned_match_id is not null then
    update public.planned_matches set status=case when v_next='approved' then 'confirmed'::public.planned_match_status else 'cancelled'::public.planned_match_status end where id=v_match.planned_match_id;
  end if;
  return v_next;
end;
$$;

create or replace function public.mark_notifications_read_v1()
returns int language plpgsql security definer set search_path='' as $$declare v_count int;begin if auth.uid() is null then raise exception 'sign in first';end if;update public.notifications set read_at=now()where player_id=auth.uid()and read_at is null;get diagnostics v_count=row_count;return v_count;end;$$;
create or replace function public.open_notification_v1(p_notification_id uuid)
returns text language plpgsql security definer set search_path='' as $$declare v_target text;begin update public.notifications set read_at=coalesce(read_at,now())where id=p_notification_id and player_id=auth.uid()returning coalesce(target_path,case when planned_match_id is not null then '/matches/'||planned_match_id else '/notifications'end)into v_target;if not found then raise exception 'notification not found';end if;return case when left(v_target,1)='/'then v_target else '/notifications'end;end;$$;

create or replace function public.bump_scoring_fact_version_v1()returns trigger language plpgsql security definer set search_path='' as $$begin update public.scoring_cache_state set fact_version=fact_version+1 where singleton;return null;end;$$;
create trigger scoring_version_matches after insert or update or delete on public.matches for each statement execute function public.bump_scoring_fact_version_v1();
create trigger scoring_version_placements after insert or update or delete on public.tournament_placements for each statement execute function public.bump_scoring_fact_version_v1();
create trigger scoring_version_practice after insert or update or delete on public.practice_sessions for each statement execute function public.bump_scoring_fact_version_v1();
create trigger scoring_version_play_days after insert or update or delete on public.play_days for each statement execute function public.bump_scoring_fact_version_v1();

create or replace function public.replace_rating_cache_with_reigns_v2(p_history jsonb,p_ratings jsonb,p_reigns jsonb,p_source_version bigint)
returns void language plpgsql security definer set search_path='' as $$declare v_current bigint;begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ciabatta-rating-cache'));select fact_version into v_current from public.scoring_cache_state where singleton for update;if v_current<>p_source_version then raise exception 'stale scoring snapshot: expected %, got %',v_current,p_source_version;end if;perform public.replace_rating_cache_with_reigns(p_history,p_ratings,p_reigns);update public.scoring_cache_state set built_version=p_source_version,rebuilt_at=now()where singleton;end;$$;

-- Missing-metadata inbox work is a database side effect of approval.
create or replace function public.notify_untagged_match_v1()returns trigger language plpgsql security definer set search_path='' as $$
declare v_week text:=to_char(now() at time zone 'Australia/Melbourne','IYYY-IW');
begin if new.status='approved'and(old.status is distinct from new.status)and(new.court_id is null or new.surface is null)then
insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
select recipient,'untagged_matches_nudge',new.id,'Some of your match records are missing a court or surface. Complete the record when you have a minute.','/matches/untagged','untagged:'||v_week
from unnest(array[new.player1_id,new.player2_id])recipient where recipient is not null on conflict(player_id,dedupe_key)where dedupe_key is not null do nothing;end if;return new;end;$$;
create trigger matches_untagged_notification after update of status on public.matches for each row execute function public.notify_untagged_match_v1();

revoke all on function public.assert_standard_match_payload_v1(jsonb,uuid,uuid,uuid,timestamptz,public.match_format,text) from public;
revoke all on function public.validate_planned_result_payload_v1() from public;
revoke all on function public.submit_match_v3(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.admin_log_match_v2(uuid,uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.log_external_match_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.record_external_planned_result_v3(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.resubmit_queried_match_v3(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) from public;
revoke all on function public.create_planned_match_v1(uuid,uuid,uuid,timestamptz,text,uuid) from public;
revoke all on function public.respond_planned_match_v1(uuid,text) from public;
revoke all on function public.confirm_match_v1(uuid) from public;
revoke all on function public.review_practice_v1(uuid,public.practice_status) from public;
revoke all on function public.mark_notifications_read_v1() from public;
revoke all on function public.open_notification_v1(uuid) from public;
revoke all on function public.replace_rating_cache_with_reigns_v2(jsonb,jsonb,jsonb,bigint) from public;
grant execute on function public.submit_match_v3(uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.admin_log_match_v2(uuid,uuid,uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.log_external_match_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.record_external_planned_result_v3(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.resubmit_queried_match_v3(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) to authenticated;
grant execute on function public.create_planned_match_v1(uuid,uuid,uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.respond_planned_match_v1(uuid,text) to authenticated;
grant execute on function public.confirm_match_v1(uuid) to authenticated;
grant execute on function public.review_practice_v1(uuid,public.practice_status) to authenticated;
grant execute on function public.mark_notifications_read_v1() to authenticated;
grant execute on function public.open_notification_v1(uuid) to authenticated;
grant execute on function public.replace_rating_cache_with_reigns_v2(jsonb,jsonb,jsonb,bigint) to service_role;

-- Existing transition RPCs remain available during the rolling window, but
-- lose ambient object resolution before the enforcement migration retires the
-- obsolete creation/resubmission entry points.
alter function public.submit_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) set search_path='';
alter function public.approve_planned_result_v2(uuid) set search_path='';
alter function public.request_planned_result_correction_v2(uuid) set search_path='';
alter function public.correct_planned_result_v2(uuid,public.match_type,public.match_format,text,uuid,jsonb,timestamptz,text,uuid,public.surface) set search_path='';
alter function public.record_external_planned_result_v2(uuid,text,boolean,public.match_format,text,boolean,timestamptz,text,uuid,public.surface,jsonb) set search_path='';
alter function public.review_match_v2(uuid,text) set search_path='';
alter function public.resubmit_queried_match_v2(uuid,public.match_type,public.match_format,text,uuid,timestamptz,text,uuid,public.surface,jsonb) set search_path='';
