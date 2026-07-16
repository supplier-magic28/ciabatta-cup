-- Close transactional and clean-stack privilege gaps found during the
-- architecture verification pass (ADR-0043). This migration is additive so it
-- may land before the application artifact; mutation-path revocations follow
-- in 20260718130000 after the new RPC callers are live.

-- RLS policies do not imply SQL privileges on a clean Supabase project.
grant select on public.tournaments,public.tournament_participants,public.fixtures,
  public.tournament_placements,public.play_days to authenticated;
grant insert,delete on public.play_days to authenticated;
grant update(nickname,use_nickname,avatar_url) on public.players to authenticated;

-- The original anonymous points check retained a generated name that the cup
-- builder could not predict; remove it so the explicit 1-8 constraint is the
-- sole placement award contract.
alter table public.tournament_placements drop constraint if exists tournament_placements_check;

-- One deterministic standings definition is shared by stage and placement
-- validation. Head-to-head is a mini-league inside an otherwise tied
-- wins/game-difference cohort; seed and UUID are stable final tie-breakers.
create or replace function public.tournament_standings_v1(p_tournament_id uuid)
returns table(
  player_id uuid,
  seed int,
  won int,
  game_difference int,
  head_to_head_wins int,
  standing int
)
language sql stable security definer set search_path=''
as $$
  with metrics as (
    select p.player_id,p.seed,
      count(distinct m.id) filter(where m.winner_id=p.player_id)::int as won,
      coalesce(sum(case
        when m.player1_id=p.player_id then s.p1_games-s.p2_games
        when m.player2_id=p.player_id then s.p2_games-s.p1_games
        else 0 end),0)::int as game_difference
    from public.tournament_participants p
    left join public.fixtures f on f.tournament_id=p.tournament_id
      and f.stage='group' and p.player_id in(f.player1_id,f.player2_id)
    left join public.matches m on m.fixture_id=f.id and m.status='approved'
    left join public.match_sets s on s.match_id=m.id
    where p.tournament_id=p_tournament_id
    group by p.player_id,p.seed
  ), head_to_head as (
    select a.player_id,
      count(distinct m.id) filter(
        where m.winner_id=a.player_id and opponent.player_id is not null
      )::int as head_to_head_wins
    from metrics a
    left join public.fixtures f on f.tournament_id=p_tournament_id
      and f.stage='group' and a.player_id in(f.player1_id,f.player2_id)
    left join public.matches m on m.fixture_id=f.id and m.status='approved'
    left join metrics opponent
      on opponent.player_id=case when m.player1_id=a.player_id then m.player2_id else m.player1_id end
      and opponent.won=a.won and opponent.game_difference=a.game_difference
    group by a.player_id
  ), ranked as (
    select metrics.*,coalesce(head_to_head.head_to_head_wins,0)::int as head_to_head_wins
    from metrics left join head_to_head using(player_id)
  )
  select ranked.player_id,ranked.seed,ranked.won,ranked.game_difference,
    ranked.head_to_head_wins,
    row_number() over(order by ranked.won desc,ranked.game_difference desc,
      ranked.head_to_head_wins desc,ranked.seed,ranked.player_id)::int
  from ranked
$$;
revoke all on function public.tournament_standings_v1(uuid) from public,authenticated;

-- Stable practice retries must be identical, not merely owned by the same
-- actor and operation key.
create or replace function public.submit_practice_v1(
  p_operation_key uuid,p_activity public.practice_activity,p_minutes int,
  p_practiced_on date,p_note text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_existing public.practice_sessions%rowtype;
  v_id uuid;
  v_note text:=nullif(btrim(p_note),'');
begin
  if not public.is_active_player() then raise exception 'only active players may submit practice'; end if;
  if p_operation_key is null then raise exception 'practice operation key is required'; end if;
  if p_minutes not between 1 and 300 then raise exception 'practice minutes must be between 1 and 300'; end if;
  if p_practiced_on is null or p_practiced_on>(now() at time zone 'Australia/Melbourne')::date then raise exception 'practice date cannot be in the future'; end if;
  if char_length(coalesce(v_note,''))>500 then raise exception 'practice note is too long'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_operation_key::text,0));
  select * into v_existing from public.practice_sessions
    where player_id=v_actor and operation_key=p_operation_key;
  if found then
    if v_existing.activity is distinct from p_activity
      or v_existing.minutes is distinct from p_minutes
      or v_existing.practiced_on is distinct from p_practiced_on
      or nullif(btrim(v_existing.note),'') is distinct from v_note
    then raise exception 'practice operation key conflicts with another payload'; end if;
    return v_existing.id;
  end if;
  insert into public.practice_sessions(player_id,activity,minutes,practiced_on,note,operation_key)
  values(v_actor,p_activity,p_minutes,p_practiced_on,v_note,p_operation_key)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_practice_v1(uuid,public.practice_activity,int,date,text) from public;
grant execute on function public.submit_practice_v1(uuid,public.practice_activity,int,date,text) to authenticated;

-- Lock tournament before invite so draw lock and acceptance serialize in a
-- single order. Accepted responses remain idempotent after the draw locks.
create or replace function public.respond_to_tournament_invite_v2(p_tournament_id uuid)
returns public.tournament_invites
language plpgsql security definer set search_path=''
as $$
declare
  v_i public.tournament_invites%rowtype;
  v_t public.tournaments%rowtype;
begin
  if not public.is_active_player() then raise exception 'only active players may respond'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  select * into v_i from public.tournament_invites
    where tournament_id=p_tournament_id and player_id=auth.uid() for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_i.status='accepted' then return v_i; end if;
  if v_t.status<>'draft' then raise exception 'cup invitations are closed'; end if;
  if v_i.status='expired' or v_i.hold_until<=now() then
    update public.tournament_invites set status='expired'
      where tournament_id=p_tournament_id and player_id=auth.uid()
      returning * into v_i;
    return v_i;
  end if;
  if v_t.draw_locked_at is not null then raise exception 'the final field is already locked'; end if;
  if v_i.status not in('sent','opened') then raise exception 'invitation is unavailable'; end if;
  update public.tournament_invites
    set status='accepted',opened_at=coalesce(opened_at,now()),accepted_at=coalesce(accepted_at,now())
    where tournament_id=p_tournament_id and player_id=auth.uid()
    returning * into v_i;
  return v_i;
end;
$$;
revoke all on function public.respond_to_tournament_invite_v2(uuid) from public;
grant execute on function public.respond_to_tournament_invite_v2(uuid) to authenticated;

create or replace function public.respond_to_tournament_invite_v1(p_tournament_id uuid)
returns public.tournament_invites language sql security definer set search_path=''
as $$ select public.respond_to_tournament_invite_v2(p_tournament_id) $$;
revoke all on function public.respond_to_tournament_invite_v1(uuid) from public;
grant execute on function public.respond_to_tournament_invite_v1(uuid) to authenticated;

-- Accepted invitations are terminal facts and generations only advance from an
-- expired fact into a fresh sent invitation.
create or replace function public.guard_tournament_invite_history_v1()
returns trigger language plpgsql set search_path=''
as $$
begin
  if old.status='accepted' and new is distinct from old then
    raise exception 'accepted invitation history is immutable';
  end if;
  if new.generation<old.generation or new.generation>old.generation+1 then
    raise exception 'invalid invitation generation';
  end if;
  if new.generation=old.generation+1
    and (old.status<>'expired' or new.status<>'sent'
      or new.opened_at is not null or new.accepted_at is not null)
  then raise exception 'new invitation generation requires an expired predecessor'; end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_invite_history on public.tournament_invites;
create trigger guard_tournament_invite_history
before update on public.tournament_invites for each row
execute function public.guard_tournament_invite_history_v1();
revoke all on function public.guard_tournament_invite_history_v1() from public;

-- A durable revision makes each correction cycle a new event even when several
-- transitions occur in one transaction. Retries without a status change reuse
-- the same revision.
alter table public.matches add column if not exists lifecycle_revision bigint not null default 0;
create or replace function public.bump_match_lifecycle_revision_v1()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status is distinct from old.status then new.lifecycle_revision:=old.lifecycle_revision+1; end if;
  return new;
end;
$$;
drop trigger if exists bump_match_lifecycle_revision on public.matches;
create trigger bump_match_lifecycle_revision
before update of status on public.matches for each row
execute function public.bump_match_lifecycle_revision_v1();
revoke all on function public.bump_match_lifecycle_revision_v1() from public;

-- Each correction cycle is a new event; retries inside a transition remain
-- deduped. Terminal approved/rejected events retain stable keys.
create or replace function public.notify_match_lifecycle()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_kind public.notification_kind;v_body text;v_cycle text:=new.lifecycle_revision::text;
begin
  if new.status='pending_confirmation' and new.player2_id is not null
     and new.tournament_id is null and new.planned_match_id is null
     and (tg_op='INSERT' or old.status='queried') then
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    values(new.player2_id,'match_confirmation_required',new.id,
      'A match result is waiting for your confirmation.','/matches',
      'match:'||new.id||':confirmation:'||v_cycle)
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if new.status='pending_approval' and new.tournament_id is null
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(player_id,kind,match_id,planned_match_id,body,target_path,dedupe_key)
    select id,'match_awaiting_admin_approval',new.id,new.planned_match_id,
      'A ranked match is waiting for organiser approval.','/admin/approvals?kind=matches',
      'match:'||new.id||':admin_approval:'||v_cycle
    from public.players where role='admin' and status='active'
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status
     and new.status in('approved','queried','rejected') then
    v_kind:=case new.status when 'approved' then 'match_approved' when 'queried' then 'match_queried' else 'match_rejected' end;
    v_body:=case new.status when 'approved' then 'Your match result was approved.' when 'queried' then 'Your match result needs a correction.' else 'Your match result was rejected.' end;
    if new.planned_match_id is null and new.status='queried' then
      insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
      values(new.submitted_by,v_kind,new.id,v_body,'/matches',
        'match:'||new.id||':queried:'||new.submitted_by||':'||v_cycle)
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    elsif (new.planned_match_id is null and new.status in('approved','rejected'))
       or (new.planned_match_id is not null and new.status='rejected') then
      insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
      select recipient,v_kind,new.id,v_body,'/matches',
        'match:'||new.id||':'||new.status||':'||recipient
      from unnest(array[new.player1_id,new.player2_id]) recipient where recipient is not null
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- Play-day metadata does not change the projection; identity/date changes do.
create or replace function public.bump_scoring_fact_version_play_days_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' or tg_op='DELETE'
    or row(old.player_id,old.played_on) is distinct from row(new.player_id,new.played_on)
  then update public.scoring_cache_state set fact_version=fact_version+1 where singleton; end if;
  return null;
end;
$$;
drop trigger if exists scoring_version_play_days on public.play_days;
create trigger scoring_version_play_days
after insert or update or delete on public.play_days for each row
execute function public.bump_scoring_fact_version_play_days_v1();
revoke all on function public.bump_scoring_fact_version_play_days_v1() from public;

-- Validate and return the only placement ordering that current cup facts allow.
create or replace function public.canonical_tournament_placements_v1(
  p_tournament_id uuid,p_completion_path public.tournament_completion_path
) returns table(player_id uuid,placement int,points int)
language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_players uuid[];
  v_wins int[];
  v_expected uuid[];
  v_count int;
  v_fixture_count int;
  v_result_count int;
  v_cutoff int;
  v_decider record;
  v_final record;
  v_playoff record;
  v_sf1 record;
  v_sf2 record;
  v_tmp uuid;
begin
  if p_completion_path is null then raise exception 'completion path is required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is null then raise exception 'lock the draw before completing the cup'; end if;
  if p_completion_path='round_robin' and v_t.championship_path<>'standings' then raise exception 'wrong completion path'; end if;
  if p_completion_path='final_stage' and v_t.championship_path='standings' then raise exception 'wrong completion path'; end if;

  select count(*),count(distinct f.id) filter(where m.id is not null)
    into v_fixture_count,v_result_count
  from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
  where f.tournament_id=v_t.id and f.stage='group';
  if v_fixture_count=0 or v_result_count<>v_fixture_count then raise exception 'complete every round-robin fixture first'; end if;

  select array_agg(s.player_id order by s.standing),array_agg(s.won order by s.standing),count(*)
    into v_players,v_wins,v_count
  from public.tournament_standings_v1(v_t.id) s;
  if v_count not between 2 and 8 then raise exception 'cup participant count is invalid'; end if;

  v_cutoff:=case v_t.championship_path when 'standings' then 1 when 'top_two_final' then least(2,v_count) else 4 end;
  if v_t.championship_path='top_four_finals' and v_count<4 then raise exception 'top-four finals require four players'; end if;
  if v_cutoff<v_count and v_wins[v_cutoff]=v_wins[v_cutoff+1] then
    select f.player1_id,f.player2_id,m.winner_id into v_decider
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='tiebreak';
    if not found or v_decider.player1_id is distinct from v_players[v_cutoff]
      or v_decider.player2_id is distinct from v_players[v_cutoff+1]
    then raise exception 'install the canonical qualification decider first'; end if;
    if v_decider.winner_id is null then raise exception 'complete the qualification decider first'; end if;
    if v_decider.winner_id=v_players[v_cutoff+1] then
      v_tmp:=v_players[v_cutoff];v_players[v_cutoff]:=v_players[v_cutoff+1];v_players[v_cutoff+1]:=v_tmp;
    elsif v_decider.winner_id<>v_players[v_cutoff] then raise exception 'qualification decider winner is invalid'; end if;
  end if;

  if p_completion_path='round_robin' then
    v_expected:=v_players;
  elsif v_t.championship_path='top_four_finals' then
    if (select count(*) from public.fixtures where tournament_id=v_t.id and stage='semifinal')<>2 then raise exception 'install both canonical semifinals first'; end if;
    select f.player1_id,f.player2_id,m.winner_id into v_sf1
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='semifinal'
    order by f.round_number,f.slot_number,f.court_number,f.id limit 1;
    select f.player1_id,f.player2_id,m.winner_id into v_sf2
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='semifinal'
    order by f.round_number,f.slot_number,f.court_number,f.id offset 1 limit 1;
    if v_sf1.player1_id is distinct from v_players[1] or v_sf1.player2_id is distinct from v_players[4]
      or v_sf2.player1_id is distinct from v_players[2] or v_sf2.player2_id is distinct from v_players[3]
    then raise exception 'semifinals do not match canonical qualification'; end if;
    if v_sf1.winner_id is null or v_sf2.winner_id is null then raise exception 'complete both semifinals first'; end if;
    select f.player1_id,f.player2_id,m.winner_id into v_final
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='final';
    select f.player1_id,f.player2_id,m.winner_id into v_playoff
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='playoff';
    if v_final.player1_id is distinct from v_sf1.winner_id or v_final.player2_id is distinct from v_sf2.winner_id then raise exception 'final does not match semifinal winners'; end if;
    if v_playoff.player1_id is distinct from (case when v_sf1.winner_id=v_sf1.player1_id then v_sf1.player2_id else v_sf1.player1_id end)
      or v_playoff.player2_id is distinct from (case when v_sf2.winner_id=v_sf2.player1_id then v_sf2.player2_id else v_sf2.player1_id end)
    then raise exception 'placement match does not match semifinal losers'; end if;
    if v_final.winner_id is null then raise exception 'complete the final first'; end if;
    if v_playoff.winner_id is null then raise exception 'complete the placement match first'; end if;
    v_expected:=array[
      v_final.winner_id,
      case when v_final.winner_id=v_final.player1_id then v_final.player2_id else v_final.player1_id end,
      v_playoff.winner_id,
      case when v_playoff.winner_id=v_playoff.player1_id then v_playoff.player2_id else v_playoff.player1_id end
    ];
    v_expected:=v_expected||array(select x from unnest(v_players)x where not x=any(v_expected));
  else
    select f.player1_id,f.player2_id,m.winner_id into v_final
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='final';
    if not found or v_final.player1_id is distinct from v_players[1]
      or v_final.player2_id is distinct from v_players[2] then raise exception 'install the canonical final first'; end if;
    if v_final.winner_id is null then raise exception 'complete the final first'; end if;
    v_expected:=array[v_final.winner_id,
      case when v_final.winner_id=v_final.player1_id then v_final.player2_id else v_final.player1_id end];
    if v_count>=4 then
      select f.player1_id,f.player2_id,m.winner_id into v_playoff
      from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
      where f.tournament_id=v_t.id and f.stage='playoff';
      if not found or v_playoff.player1_id is distinct from v_players[3]
        or v_playoff.player2_id is distinct from v_players[4] then raise exception 'install the canonical placement match first'; end if;
      if v_playoff.winner_id is null then raise exception 'complete the placement match first'; end if;
      v_expected:=v_expected||array[v_playoff.winner_id,
        case when v_playoff.winner_id=v_playoff.player1_id then v_playoff.player2_id else v_playoff.player1_id end];
    elsif exists(select 1 from public.fixtures where tournament_id=v_t.id and stage='playoff') then
      raise exception 'placement match is not allowed for this field';
    end if;
    v_expected:=v_expected||array(select x from unnest(v_players)x where not x=any(v_expected));
  end if;

  return query
  select x.player_id,x.placement::int,
    case x.placement when 1 then 100 when 2 then 50 when 3 then 20 when 4 then 10 else 0 end::int
  from unnest(v_expected) with ordinality x(player_id,placement);
end;
$$;
revoke all on function public.canonical_tournament_placements_v1(uuid,public.tournament_completion_path) from public,authenticated;

-- Stage payloads are verified against locked group results, qualification path,
-- exact pairings, schedule slots, and any prerequisite decider/semifinal facts.
create or replace function public.install_tournament_stage_v1(
  p_tournament_id uuid,p_transition text,p_fixtures jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_players uuid[];
  v_wins int[];
  v_count int;
  v_fixture_count int;
  v_result_count int;
  v_cutoff int;
  v_round int;
  v_requested int;
  v_existing int;
  v_second_slot int;
  v_second_court int;
  v_decider record;
  v_sf1 record;
  v_sf2 record;
  v_tmp uuid;
  v_needs_decider boolean;
begin
  if not public.is_admin() then raise exception 'only active organisers may advance cups'; end if;
  if p_transition is null or p_transition not in('tiebreak','semifinal','final_stage') then raise exception 'invalid cup transition'; end if;
  if p_fixtures is null or jsonb_typeof(p_fixtures)<>'array'
    or jsonb_array_length(p_fixtures) not between 1 and 2 then raise exception 'invalid championship fixtures'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is null then raise exception 'lock the draw before advancing the cup'; end if;
  if v_t.status not in('scheduled','live') then raise exception 'cup cannot advance'; end if;

  select count(*),count(distinct f.id) filter(where m.id is not null)
    into v_fixture_count,v_result_count
  from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
  where f.tournament_id=v_t.id and f.stage='group';
  if v_fixture_count=0 or v_result_count<>v_fixture_count then raise exception 'complete every round-robin fixture first'; end if;
  select array_agg(s.player_id order by s.standing),array_agg(s.won order by s.standing),count(*)
    into v_players,v_wins,v_count from public.tournament_standings_v1(v_t.id)s;
  if v_count not between 2 and 8 then raise exception 'cup participant count is invalid'; end if;
  if v_t.championship_path='top_four_finals' and v_count<4 then raise exception 'top-four finals require four players'; end if;
  v_cutoff:=case v_t.championship_path when 'standings' then 1 when 'top_two_final' then least(2,v_count) else 4 end;
  v_needs_decider:=v_cutoff<v_count and v_wins[v_cutoff]=v_wins[v_cutoff+1];
  v_requested:=jsonb_array_length(p_fixtures);
  v_second_court:=least(2,v_t.courts);
  v_second_slot:=case when v_t.courts=1 then 2 else 1 end;

  if exists(select 1 from jsonb_array_elements(p_fixtures)x
    where nullif(x->>'stage','') is null or nullif(x->>'round_number','') is null
      or nullif(x->>'slot_number','') is null or nullif(x->>'court_number','') is null
      or nullif(x->>'player1_id','') is null or nullif(x->>'player2_id','') is null
      or (x->>'player1_id')::uuid=(x->>'player2_id')::uuid
      or (x->>'round_number')::int<1 or (x->>'slot_number')::int<1
      or (x->>'court_number')::int not between 1 and v_t.courts
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player1_id')::uuid)
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player2_id')::uuid)
  ) then raise exception 'championship fixtures contain invalid fields'; end if;

  if p_transition='tiebreak' then
    if not v_needs_decider then raise exception 'qualification decider is not required'; end if;
    select coalesce(max(round_number),0)+1 into v_round from public.fixtures where tournament_id=v_t.id and stage='group';
    if v_requested<>1 or not exists(select 1 from jsonb_array_elements(p_fixtures)x
      where x->>'stage'='tiebreak' and (x->>'round_number')::int=v_round
        and (x->>'slot_number')::int=1 and (x->>'court_number')::int=1
        and (x->>'player1_id')::uuid=v_players[v_cutoff]
        and (x->>'player2_id')::uuid=v_players[v_cutoff+1])
    then raise exception 'invalid canonical tiebreak transition'; end if;
  else
    if v_needs_decider then
      select f.player1_id,f.player2_id,m.winner_id into v_decider
      from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
      where f.tournament_id=v_t.id and f.stage='tiebreak';
      if not found or v_decider.player1_id is distinct from v_players[v_cutoff]
        or v_decider.player2_id is distinct from v_players[v_cutoff+1] then raise exception 'install the canonical qualification decider first'; end if;
      if v_decider.winner_id is null then raise exception 'complete the qualification decider first'; end if;
      if v_decider.winner_id=v_players[v_cutoff+1] then
        v_tmp:=v_players[v_cutoff];v_players[v_cutoff]:=v_players[v_cutoff+1];v_players[v_cutoff+1]:=v_tmp;
      elsif v_decider.winner_id<>v_players[v_cutoff] then raise exception 'qualification decider winner is invalid'; end if;
    end if;

    if p_transition='semifinal' then
      if v_t.championship_path<>'top_four_finals' then raise exception 'semifinals are not configured for this cup'; end if;
      select coalesce(max(round_number),0)+1 into v_round from public.fixtures
        where tournament_id=v_t.id and stage in('group','tiebreak');
      if v_requested<>2
        or not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='semifinal'
          and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=1 and (x->>'court_number')::int=1
          and (x->>'player1_id')::uuid=v_players[1] and (x->>'player2_id')::uuid=v_players[4])
        or not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='semifinal'
          and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=v_second_slot and (x->>'court_number')::int=v_second_court
          and (x->>'player1_id')::uuid=v_players[2] and (x->>'player2_id')::uuid=v_players[3])
      then raise exception 'invalid canonical semifinal transition'; end if;
    else
      if v_t.championship_path='standings' then raise exception 'final stage is not configured for this cup'; end if;
      if v_t.championship_path='top_four_finals' then
        if (select count(*) from public.fixtures where tournament_id=v_t.id and stage='semifinal')<>2 then raise exception 'install both semifinals first'; end if;
        select f.player1_id,f.player2_id,m.winner_id into v_sf1
        from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
        where f.tournament_id=v_t.id and f.stage='semifinal'
        order by f.round_number,f.slot_number,f.court_number,f.id limit 1;
        select f.player1_id,f.player2_id,m.winner_id into v_sf2
        from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
        where f.tournament_id=v_t.id and f.stage='semifinal'
        order by f.round_number,f.slot_number,f.court_number,f.id offset 1 limit 1;
        if v_sf1.player1_id is distinct from v_players[1] or v_sf1.player2_id is distinct from v_players[4]
          or v_sf2.player1_id is distinct from v_players[2] or v_sf2.player2_id is distinct from v_players[3] then raise exception 'semifinals do not match canonical qualification'; end if;
        if v_sf1.winner_id is null or v_sf2.winner_id is null then raise exception 'complete both semifinals first'; end if;
        select coalesce(max(round_number),0)+1 into v_round from public.fixtures
          where tournament_id=v_t.id and stage in('group','tiebreak','semifinal');
        if v_requested<>2
          or not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='final'
            and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=1 and (x->>'court_number')::int=1
            and (x->>'player1_id')::uuid=v_sf1.winner_id and (x->>'player2_id')::uuid=v_sf2.winner_id)
          or not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='playoff'
            and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=v_second_slot and (x->>'court_number')::int=v_second_court
            and (x->>'player1_id')::uuid=case when v_sf1.winner_id=v_sf1.player1_id then v_sf1.player2_id else v_sf1.player1_id end
            and (x->>'player2_id')::uuid=case when v_sf2.winner_id=v_sf2.player1_id then v_sf2.player2_id else v_sf2.player1_id end)
        then raise exception 'invalid canonical final transition'; end if;
      else
        select coalesce(max(round_number),0)+1 into v_round from public.fixtures
          where tournament_id=v_t.id and stage in('group','tiebreak');
        if v_requested<>(case when v_count>=4 then 2 else 1 end)
          or not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='final'
            and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=1 and (x->>'court_number')::int=1
            and (x->>'player1_id')::uuid=v_players[1] and (x->>'player2_id')::uuid=v_players[2])
          or (v_count>=4 and not exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'='playoff'
            and (x->>'round_number')::int=v_round and (x->>'slot_number')::int=v_second_slot and (x->>'court_number')::int=v_second_court
            and (x->>'player1_id')::uuid=v_players[3] and (x->>'player2_id')::uuid=v_players[4]))
        then raise exception 'invalid canonical final transition'; end if;
      end if;
    end if;
  end if;

  select count(*) into v_existing from public.fixtures f where f.tournament_id=v_t.id and (
    (p_transition='tiebreak' and f.stage='tiebreak')
    or (p_transition='semifinal' and f.stage='semifinal')
    or (p_transition='final_stage' and f.stage in('final','playoff'))
  );
  if v_existing>0 then
    if v_existing<>v_requested or exists(select 1 from jsonb_array_elements(p_fixtures)x where not exists(
      select 1 from public.fixtures f where f.tournament_id=v_t.id
        and f.stage::text=x->>'stage' and f.round_number=(x->>'round_number')::int
        and f.slot_number=(x->>'slot_number')::int and f.court_number=(x->>'court_number')::int
        and f.player1_id=(x->>'player1_id')::uuid and f.player2_id=(x->>'player2_id')::uuid
    )) then raise exception 'cup transition conflicts with installed stage'; end if;
    return false;
  end if;

  perform pg_catalog.set_config('app.tournament_stage_rpc','on',true);
  insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
  select v_t.id,(x->>'stage')::public.fixture_stage,(x->>'round_number')::int,
    (x->>'slot_number')::int,(x->>'court_number')::int,v_t.playoff_ruleset,
    (x->>'player1_id')::uuid,(x->>'player2_id')::uuid
  from jsonb_array_elements(p_fixtures)x;
  perform pg_catalog.set_config('app.tournament_stage_rpc','',true);
  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'championship fixtures contain invalid values';
end;
$$;
revoke all on function public.install_tournament_stage_v1(uuid,text,jsonb) from public;
grant execute on function public.install_tournament_stage_v1(uuid,text,jsonb) to authenticated;

-- Completion uses canonical database facts. The client payload is a retry
-- identity/checksum; it never determines the rows that are inserted.
create or replace function public.finalize_tournament_v1(
  p_tournament_id uuid,p_completion_path public.tournament_completion_path,p_placements jsonb
) returns void language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_expected jsonb;
  v_requested jsonb;
  v_persisted jsonb;
begin
  if not public.is_admin() then raise exception 'only active organisers may complete cups'; end if;
  if p_completion_path is null then raise exception 'completion path is required'; end if;
  if p_placements is null or jsonb_typeof(p_placements)<>'array' then raise exception 'placements are required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.status not in('scheduled','live','completed') then raise exception 'cup cannot complete'; end if;
  if v_t.status='completed' and v_t.completion_path is distinct from p_completion_path then raise exception 'completed cup retry conflicts with completion path'; end if;

  select jsonb_agg(jsonb_build_object('player_id',p.player_id,'placement',p.placement,'points',p.points) order by p.placement)
    into v_expected from public.canonical_tournament_placements_v1(v_t.id,p_completion_path)p;
  select jsonb_agg(jsonb_build_object('player_id',x.player_id,'placement',x.placement,'points',x.points) order by x.placement)
    into v_requested from jsonb_to_recordset(p_placements)x(player_id uuid,placement int,points int);
  if v_requested is distinct from v_expected then raise exception 'placements do not match authoritative tournament results'; end if;

  if v_t.status='completed' then
    select jsonb_agg(jsonb_build_object('player_id',p.player_id,'placement',p.placement,'points',p.points) order by p.placement)
      into v_persisted from public.tournament_placements p where p.tournament_id=v_t.id;
    if v_persisted is distinct from v_expected then raise exception 'completed cup placement facts conflict'; end if;
    return;
  end if;
  if exists(select 1 from public.tournament_placements where tournament_id=v_t.id) then raise exception 'cup already has placement facts'; end if;

  perform pg_catalog.set_config('app.tournament_completion_rpc','on',true);
  insert into public.tournament_placements(tournament_id,player_id,placement,points,awarded_at)
  select v_t.id,x.player_id,x.placement,x.points,v_t.starts_at
  from jsonb_to_recordset(v_expected)x(player_id uuid,placement int,points int);

  perform public.enqueue_custom_email_v1(
    'tournament/'||v_t.id||'/result_'||case x.placement when 1 then '1st' when 2 then '2nd' when 3 then '3rd' else x.placement||'th' end||'/'||x.player_id,
    'tournament_result_'||case x.placement when 1 then '1st' when 2 then '2nd' when 3 then '3rd' else x.placement||'th' end,
    x.player_id,'tournament',v_t.id
  ) from jsonb_to_recordset(v_expected)x(player_id uuid,placement int,points int);
  update public.tournaments set status='completed',completion_path=p_completion_path where id=v_t.id;
  perform pg_catalog.set_config('app.tournament_completion_rpc','',true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'placements contain invalid values';
end;
$$;
revoke all on function public.finalize_tournament_v1(uuid,public.tournament_completion_path,jsonb) from public;
grant execute on function public.finalize_tournament_v1(uuid,public.tournament_completion_path,jsonb) to authenticated;

-- Rolling compatibility: old callers complete standings through the same
-- canonical atomic finalizer rather than marking status first.
create or replace function public.complete_tournament_from_standings_v2(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_t public.tournaments%rowtype;v_placements jsonb;
begin
  if not public.is_admin() then raise exception 'only active organisers may complete cups'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  select jsonb_agg(jsonb_build_object('player_id',p.player_id,'placement',p.placement,'points',p.points) order by p.placement)
    into v_placements from public.canonical_tournament_placements_v1(v_t.id,'round_robin')p;
  perform public.finalize_tournament_v1(v_t.id,'round_robin',v_placements);
end;
$$;
create or replace function public.complete_tournament_from_standings(p_tournament_id uuid)
returns void language sql security definer set search_path=''
as $$ select public.complete_tournament_from_standings_v2(p_tournament_id) $$;
revoke all on function public.complete_tournament_from_standings_v2(uuid) from public;
revoke all on function public.complete_tournament_from_standings(uuid) from public;
grant execute on function public.complete_tournament_from_standings_v2(uuid) to authenticated;
grant execute on function public.complete_tournament_from_standings(uuid) to authenticated;

-- Same receipt is idempotent; a different receipt can never rewrite sent mail.
create or replace function public.mark_custom_email_sent_v1(
  p_idempotency_key text,p_provider_message_id text
) returns void language plpgsql security definer set search_path=''
as $$
declare v_row public.custom_email_outbox%rowtype;
begin
  if nullif(btrim(p_provider_message_id),'') is null then raise exception 'provider message id is required'; end if;
  select * into v_row from public.custom_email_outbox where idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'custom email intent not found'; end if;
  if v_row.status='sent' then
    if v_row.provider_message_id is distinct from btrim(p_provider_message_id) then raise exception 'sent receipt conflicts with provider message id'; end if;
    return;
  end if;
  if v_row.status<>'processing' then raise exception 'custom email intent is not claimed'; end if;
  update public.custom_email_outbox set status='sent',provider_message_id=btrim(p_provider_message_id),
    sent_at=now(),superseded_at=null,last_error=null,updated_at=now()
  where idempotency_key=p_idempotency_key;
end;
$$;
revoke all on function public.mark_custom_email_sent_v1(text,text) from public;
grant execute on function public.mark_custom_email_sent_v1(text,text) to service_role;

-- Reconcile populated legacy ledgers during upgrades and preserve recent claim
-- windows as processing instead of making them immediately claimable.
create or replace function public.reconcile_legacy_email_outbox_v1()
returns int language plpgsql security definer set search_path=''
as $$
declare v_count int:=0;v_rows int;
begin
  insert into public.custom_email_outbox(
    idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,
    provider_message_id,last_error,created_at,updated_at,claimed_at,sent_at
  )
  select idempotency_key,kind,player_id,entity_type,entity_id,
    case when status='sent' and provider_message_id is not null then 'sent'
      when status='pending' and updated_at>now()-interval '15 minutes' then 'processing'
      when status='failed' then 'failed' else 'pending' end,
    attempt_count,provider_message_id,last_error,created_at,updated_at,
    case when status='pending' and updated_at>now()-interval '15 minutes' then updated_at else null end,
    case when status='sent' and provider_message_id is not null then coalesce(sent_at,updated_at) else null end
  from public.lifecycle_email_deliveries where player_id is not null and entity_id is not null
  on conflict(idempotency_key) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  -- Migration 127 may already have created the outbox intent while the old
  -- application completed delivery through the legacy ledger. In that case
  -- the insert above conflicts with a pending outbox row: promote the durable
  -- provider receipt instead of leaving already-sent mail actionable. Never
  -- rewrite a receipt that the unified outbox has itself recorded as sent.
  update public.custom_email_outbox o set
    status='sent',
    attempt_count=greatest(o.attempt_count,l.attempt_count),
    provider_message_id=l.provider_message_id,
    last_error=null,
    updated_at=greatest(o.updated_at,coalesce(l.sent_at,l.updated_at)),
    claimed_at=coalesce(o.claimed_at,l.updated_at),
    sent_at=coalesce(l.sent_at,l.updated_at),
    superseded_at=null
  from public.lifecycle_email_deliveries l
  where o.idempotency_key=l.idempotency_key
    and o.status<>'sent'
    and l.status='sent'
    and l.provider_message_id is not null;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  -- A completed legacy failure is also authoritative during the cutover. It
  -- remains recoverable, but its prior attempt and diagnostic are preserved.
  update public.custom_email_outbox o set
    status='failed',
    attempt_count=greatest(o.attempt_count,l.attempt_count),
    provider_message_id=null,
    last_error=l.last_error,
    updated_at=greatest(o.updated_at,l.updated_at),
    claimed_at=null,
    sent_at=null,
    superseded_at=null
  from public.lifecycle_email_deliveries l
  where o.idempotency_key=l.idempotency_key
    and o.status in ('pending','failed')
    and l.status='failed'
    and (o.status='pending'
      or o.attempt_count<l.attempt_count
      or o.last_error is distinct from l.last_error
      or o.updated_at<l.updated_at);
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  insert into public.custom_email_outbox(
    idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,
    provider_message_id,created_at,updated_at,claimed_at,sent_at
  )
  select 'tournament/'||tournament_id||'/'||kind::text||'/'||player_id,
    case kind::text when 'locked_in' then 'tournament_locked_in' when 'game_day' then 'tournament_game_day' else 'tournament_'||kind::text end,
    player_id,'tournament',tournament_id,
    case when status='sent' and provider_message_id is not null then 'sent'
      when status='pending' and claimed_at>now()-interval '15 minutes' then 'processing' else 'pending' end,
    1,provider_message_id,claimed_at,coalesce(sent_at,claimed_at),
    case when status='pending' and claimed_at>now()-interval '15 minutes' then claimed_at else null end,
    case when status='sent' and provider_message_id is not null then coalesce(sent_at,claimed_at) else null end
  from public.tournament_email_deliveries
  on conflict(idempotency_key) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  update public.custom_email_outbox o set
    status='sent',
    attempt_count=greatest(o.attempt_count,1),
    provider_message_id=l.provider_message_id,
    last_error=null,
    updated_at=greatest(o.updated_at,coalesce(l.sent_at,l.claimed_at)),
    claimed_at=coalesce(o.claimed_at,l.claimed_at),
    sent_at=coalesce(l.sent_at,l.claimed_at),
    superseded_at=null
  from public.tournament_email_deliveries l
  where o.idempotency_key='tournament/'||l.tournament_id||'/'||l.kind::text||'/'||l.player_id
    and o.status<>'sent'
    and l.status='sent'
    and l.provider_message_id is not null;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  update public.custom_email_outbox o set status='processing',claimed_at=l.updated_at,updated_at=l.updated_at
  from public.lifecycle_email_deliveries l
  where o.idempotency_key=l.idempotency_key and o.status='pending'
    and l.status='pending' and l.updated_at>now()-interval '15 minutes';
  update public.custom_email_outbox o set status='processing',claimed_at=l.claimed_at,updated_at=l.claimed_at
  from public.tournament_email_deliveries l
  where o.idempotency_key='tournament/'||l.tournament_id||'/'||l.kind::text||'/'||l.player_id
    and o.status='pending' and l.status='pending' and l.claimed_at>now()-interval '15 minutes';
  return v_count;
end;
$$;
select public.reconcile_legacy_email_outbox_v1();
revoke all on function public.reconcile_legacy_email_outbox_v1() from public,authenticated,service_role;

-- Pre-lock group draws and roster substitutions use one validated transaction;
-- clients may calculate the circle schedule but cannot partially write it.
create or replace function public.assert_tournament_group_draw_v1(
  p_tournament_id uuid,p_group_fixtures jsonb
) returns void language plpgsql security definer set search_path=''
as $$
declare v_t public.tournaments%rowtype;v_count int;v_expected int;v_pairs int;v_slots int;
begin
  select * into v_t from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'cup not found'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id=v_t.id;
  v_expected:=v_count*(v_count-1)/2;
  if v_count not between 2 and 8 or p_group_fixtures is null
    or jsonb_typeof(p_group_fixtures)<>'array'
    or jsonb_array_length(p_group_fixtures)<>v_expected
  then raise exception 'draw must contain every participant pairing once'; end if;
  select count(distinct least((x->>'player1_id')::uuid,(x->>'player2_id')::uuid)::text||':'||
      greatest((x->>'player1_id')::uuid,(x->>'player2_id')::uuid)::text),
    count(distinct (x->>'round_number')||':'||(x->>'slot_number')||':'||(x->>'court_number'))
    into v_pairs,v_slots from jsonb_array_elements(p_group_fixtures)x;
  if v_pairs<>v_expected or v_slots<>v_expected or exists(
    select 1 from jsonb_array_elements(p_group_fixtures)x
    where x->>'stage'<>'group'
      or (x->>'player1_id')::uuid=(x->>'player2_id')::uuid
      or (x->>'round_number')::int<1 or (x->>'slot_number')::int<1
      or (x->>'court_number')::int not between 1 and v_t.courts
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player1_id')::uuid)
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player2_id')::uuid)
  ) then raise exception 'draw contains invalid pairings or schedule collisions'; end if;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'draw contains invalid values';
end;
$$;
revoke all on function public.assert_tournament_group_draw_v1(uuid,jsonb) from public,authenticated;

create or replace function public.replace_tournament_group_draw_v1(
  p_tournament_id uuid,p_group_fixtures jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_t public.tournaments%rowtype;v_requested int;v_existing int;
begin
  if not public.is_admin() then raise exception 'only active organisers may generate cup draws'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is not null or v_t.status not in('draft','scheduled')
    or exists(select 1 from public.matches where tournament_id=v_t.id)
  then raise exception 'cup draw is already locked'; end if;
  perform public.assert_tournament_group_draw_v1(v_t.id,p_group_fixtures);
  v_requested:=jsonb_array_length(p_group_fixtures);
  select count(*) into v_existing from public.fixtures where tournament_id=v_t.id;
  if v_existing=v_requested and not exists(select 1 from jsonb_array_elements(p_group_fixtures)x where not exists(
    select 1 from public.fixtures f where f.tournament_id=v_t.id and f.stage='group'
      and f.round_number=(x->>'round_number')::int and f.slot_number=(x->>'slot_number')::int
      and f.court_number=(x->>'court_number')::int and f.player1_id=(x->>'player1_id')::uuid
      and f.player2_id=(x->>'player2_id')::uuid
  )) then return false; end if;
  delete from public.fixtures where tournament_id=v_t.id;
  insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
  select v_t.id,'group',(x->>'round_number')::int,(x->>'slot_number')::int,
    (x->>'court_number')::int,v_t.group_ruleset,(x->>'player1_id')::uuid,(x->>'player2_id')::uuid
  from jsonb_array_elements(p_group_fixtures)x;
  update public.tournaments set status='scheduled' where id=v_t.id;
  return true;
end;
$$;
revoke all on function public.replace_tournament_group_draw_v1(uuid,jsonb) from public;
grant execute on function public.replace_tournament_group_draw_v1(uuid,jsonb) to authenticated;

create or replace function public.replace_tournament_participant_v2(
  p_tournament_id uuid,p_outgoing_player_id uuid,p_replacement_player_id uuid,
  p_group_fixtures jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_t public.tournaments%rowtype;v_seed int;v_already boolean;
begin
  if not public.is_admin() then raise exception 'only active organisers may replace cup players'; end if;
  if p_outgoing_player_id is null or p_replacement_player_id is null
    or p_outgoing_player_id=p_replacement_player_id then raise exception 'choose a distinct replacement player'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is not null or v_t.status not in('draft','scheduled')
    or exists(select 1 from public.matches where tournament_id=v_t.id)
  then raise exception 'cup field is already locked'; end if;
  if not exists(select 1 from public.players where id=p_replacement_player_id and status='active')
  then raise exception 'replacement player must be active'; end if;
  select seed into v_seed from public.tournament_participants
    where tournament_id=v_t.id and player_id=p_outgoing_player_id;
  if not found then
    select exists(select 1 from public.tournament_participants
      where tournament_id=v_t.id and player_id=p_replacement_player_id) into v_already;
    if not v_already then raise exception 'outgoing player is not in the cup'; end if;
    perform public.assert_tournament_group_draw_v1(v_t.id,p_group_fixtures);
    if exists(select 1 from jsonb_array_elements(p_group_fixtures)x where not exists(
      select 1 from public.fixtures f where f.tournament_id=v_t.id and f.stage='group'
        and f.round_number=(x->>'round_number')::int and f.slot_number=(x->>'slot_number')::int
        and f.court_number=(x->>'court_number')::int and f.player1_id=(x->>'player1_id')::uuid
        and f.player2_id=(x->>'player2_id')::uuid
    )) then raise exception 'replacement retry conflicts with installed draw'; end if;
    return false;
  end if;
  if exists(select 1 from public.tournament_participants
    where tournament_id=v_t.id and player_id=p_replacement_player_id)
  then raise exception 'replacement player is already in the cup'; end if;
  update public.tournament_participants set player_id=p_replacement_player_id
    where tournament_id=v_t.id and player_id=p_outgoing_player_id;
  perform public.assert_tournament_group_draw_v1(v_t.id,p_group_fixtures);
  delete from public.fixtures where tournament_id=v_t.id;
  insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
  select v_t.id,'group',(x->>'round_number')::int,(x->>'slot_number')::int,
    (x->>'court_number')::int,v_t.group_ruleset,(x->>'player1_id')::uuid,(x->>'player2_id')::uuid
  from jsonb_array_elements(p_group_fixtures)x;
  update public.tournaments set status='scheduled' where id=v_t.id;
  return true;
end;
$$;
revoke all on function public.replace_tournament_participant_v2(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.replace_tournament_participant_v2(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.update_tournament_cover_v1(
  p_tournament_id uuid,p_cover_image_url text,p_frame_shape public.tournament_frame_shape,
  p_zoom numeric,p_offset_x numeric,p_offset_y numeric
) returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_admin() then raise exception 'only active organisers may update cup covers'; end if;
  if p_frame_shape is null or p_zoom not between 1 and 2.5
    or p_offset_x not between -100 and 100 or p_offset_y not between -100 and 100
    or char_length(coalesce(p_cover_image_url,''))>2000
  then raise exception 'invalid cup cover metadata'; end if;
  update public.tournaments set cover_image_url=nullif(btrim(p_cover_image_url),''),
    cover_frame_shape=p_frame_shape,cover_zoom=p_zoom,
    cover_offset_x=p_offset_x,cover_offset_y=p_offset_y
  where id=p_tournament_id;
  if not found then raise exception 'cup not found'; end if;
end;
$$;
revoke all on function public.update_tournament_cover_v1(uuid,text,public.tournament_frame_shape,numeric,numeric,numeric) from public;
grant execute on function public.update_tournament_cover_v1(uuid,text,public.tournament_frame_shape,numeric,numeric,numeric) to authenticated;

-- Health compares participant and placement sets, not only their counts.
create or replace function public.core_backend_health_v5()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_snapshot jsonb;v_extra jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'only organisers may inspect backend health'; end if;
  v_snapshot:=public.core_backend_health_v4();
  select coalesce(jsonb_agg(jsonb_build_object('kind','completed_tournament_placement_set_mismatch','entityId',t.id)),'[]'::jsonb)
    into v_extra
  from public.tournaments t where t.status='completed' and (
    exists(select player_id from public.tournament_participants where tournament_id=t.id
      except select player_id from public.tournament_placements where tournament_id=t.id)
    or exists(select player_id from public.tournament_placements where tournament_id=t.id
      except select player_id from public.tournament_participants where tournament_id=t.id)
  );
  return jsonb_set(v_snapshot,'{integrityIssues}',coalesce(v_snapshot->'integrityIssues','[]'::jsonb)||v_extra,true);
end;
$$;
revoke all on function public.core_backend_health_v5() from public;
grant execute on function public.core_backend_health_v5() to authenticated;
