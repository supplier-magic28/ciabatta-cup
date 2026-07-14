-- Configurable cup lead-up, locked competition rules, and multi-set results
-- (ADR-0039). This migration is additive for a rolling application deploy.

do $$ begin
  create type public.tournament_frame_shape as enum ('wide','square','three_two');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.tournament_championship_path as enum ('standings','top_two_final','top_four_finals');
exception when duplicate_object then null; end $$;

alter table public.tournaments
  add column if not exists seat_count int not null default 4 check (seat_count between 2 and 8),
  add column if not exists schedule_locked_at timestamptz,
  add column if not exists championship_path public.tournament_championship_path not null default 'standings',
  add column if not exists cover_frame_shape public.tournament_frame_shape not null default 'wide',
  add column if not exists cover_zoom numeric(4,2) not null default 1 check (cover_zoom between 1 and 2.5),
  add column if not exists cover_offset_x numeric(6,2) not null default 0 check (cover_offset_x between -100 and 100),
  add column if not exists cover_offset_y numeric(6,2) not null default 0 check (cover_offset_y between -100 and 100);

update public.tournaments t set
  seat_count = greatest(4, least(8, (select count(*) from public.tournament_participants p where p.tournament_id=t.id))),
  schedule_locked_at = coalesce(t.schedule_locked_at, t.draw_locked_at),
  championship_path = case
    when t.completion_path='round_robin' then 'standings'::public.tournament_championship_path
    when t.completion_path='final_stage' or t.draw_locked_at is not null then 'top_two_final'::public.tournament_championship_path
    else t.championship_path end;

alter table public.tournament_placements drop constraint if exists tournament_placements_placement_check;
alter table public.tournament_placements drop constraint if exists tournament_placements_points_check;
alter table public.tournament_placements
  add constraint tournament_placements_placement_check check (placement between 1 and 8),
  add constraint tournament_placements_points_check check (
    (placement=1 and points=100) or (placement=2 and points=50) or
    (placement=3 and points=20) or (placement=4 and points=10) or
    (placement between 5 and 8 and points=0)
  );

create or replace function public.guard_locked_tournament_configuration_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.draw_locked_at is not null and (
    new.starts_at is distinct from old.starts_at or new.location_name is distinct from old.location_name or
    new.courts is distinct from old.courts or new.court_id is distinct from old.court_id or
    new.default_surface is distinct from old.default_surface or new.seat_count is distinct from old.seat_count or
    new.group_ruleset is distinct from old.group_ruleset or new.playoff_ruleset is distinct from old.playoff_ruleset or
    new.championship_path is distinct from old.championship_path or new.schedule_locked_at is distinct from old.schedule_locked_at
  ) then raise exception 'the locked draw freezes schedule, roster, formats, and championship path'; end if;
  if old.draw_locked_at is not null and new.draw_locked_at is distinct from old.draw_locked_at then
    raise exception 'the draw lock is permanent';
  end if;
  return new;
end; $$;
create trigger guard_locked_tournament_configuration
before update on public.tournaments for each row
execute function public.guard_locked_tournament_configuration_v1();

create or replace function public.create_tournament_v2(
  p_name text,p_starts_at timestamptz,p_location_name text,p_court_id uuid,p_courts int,
  p_default_surface public.surface,p_seat_count int,p_participant_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_players uuid[]:=coalesce(p_participant_ids,'{}'::uuid[]);
begin
  if v_actor is null or not public.is_admin() then raise exception 'only organisers may create cups'; end if;
  if nullif(btrim(p_name),'') is null or nullif(btrim(p_location_name),'') is null or p_starts_at is null then
    raise exception 'name, Melbourne start, and venue are required'; end if;
  if p_seat_count not between 2 and 8 or p_courts not between 1 and 20 then raise exception 'invalid cup capacity'; end if;
  if cardinality(v_players)>p_seat_count or cardinality(v_players)<>cardinality(array(select distinct x from unnest(v_players)x)) then
    raise exception 'players must be unique and fit the selected seats'; end if;
  if exists(select 1 from unnest(v_players)x left join public.players p on p.id=x where p.id is null or p.status<>'active') then
    raise exception 'cup players must be active'; end if;
  insert into public.tournaments(name,starts_at,location_name,court_id,courts,default_surface,seat_count,
    structure,status,counts_as,group_ruleset,playoff_ruleset,championship_path,timezone,created_by,rules_note)
  values(btrim(p_name),p_starts_at,btrim(p_location_name),p_court_id,p_courts,p_default_surface,p_seat_count,
    'round_robin','draft','ranked','short_first_to_3','standard_set_tiebreak_6_all','standings','Australia/Melbourne',v_actor,
    'Competition configuration freezes permanently when the draw locks.') returning id into v_id;
  insert into public.tournament_participants(tournament_id,player_id,seed)
  select v_id,x,ordinality from unnest(v_players) with ordinality p(x,ordinality);
  return v_id;
end; $$;

create or replace function public.update_tournament_schedule_v1(
  p_tournament_id uuid,p_starts_at timestamptz,p_location_name text,p_court_id uuid,p_courts int,p_default_surface public.surface
) returns void language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'only organisers may edit cup schedules'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is not null or v_t.schedule_locked_at is not null or exists(select 1 from public.matches where tournament_id=v_t.id) then
    raise exception 'unlock the schedule before editing it'; end if;
  if p_starts_at is null or nullif(btrim(p_location_name),'') is null or p_courts not between 1 and 20 then raise exception 'invalid schedule'; end if;
  update public.tournaments set starts_at=p_starts_at,location_name=btrim(p_location_name),court_id=p_court_id,courts=p_courts,default_surface=p_default_surface where id=v_t.id;
end; $$;

create or replace function public.set_tournament_schedule_lock_v1(p_tournament_id uuid,p_locked boolean)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'only organisers may lock cup schedules'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.draw_locked_at is not null or exists(select 1 from public.matches where tournament_id=v_t.id) then raise exception 'schedule can no longer change'; end if;
  v_at:=case when p_locked then coalesce(v_t.schedule_locked_at,now()) else null end;
  update public.tournaments set schedule_locked_at=v_at where id=v_t.id;return v_at;
end; $$;

create or replace function public.configure_tournament_competition_v1(
  p_tournament_id uuid,p_group_ruleset public.tournament_ruleset,p_playoff_ruleset public.tournament_ruleset,
  p_championship_path public.tournament_championship_path
) returns void language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'only organisers may configure cups'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.schedule_locked_at is null then raise exception 'lock the schedule before choosing competition rules'; end if;
  if v_t.draw_locked_at is not null or exists(select 1 from public.matches where tournament_id=v_t.id) then raise exception 'competition configuration is frozen'; end if;
  if p_championship_path='top_four_finals' and v_t.seat_count<4 then raise exception 'top-four finals require at least four seats'; end if;
  update public.tournaments set group_ruleset=p_group_ruleset,playoff_ruleset=p_playoff_ruleset,championship_path=p_championship_path where id=v_t.id;
end; $$;

create or replace function public.replace_tournament_roster_v1(p_tournament_id uuid,p_seat_count int,p_player_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;v_players uuid[]:=coalesce(p_player_ids,'{}'::uuid[]);
begin
  if not public.is_admin() then raise exception 'only organisers may edit cup rosters'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.draw_locked_at is not null or v_t.status not in('draft','scheduled') or exists(select 1 from public.matches where tournament_id=v_t.id) then
    raise exception 'cup roster is frozen'; end if;
  if p_seat_count not between 2 and 8 or cardinality(v_players)>p_seat_count or cardinality(v_players)<>cardinality(array(select distinct x from unnest(v_players)x)) then
    raise exception 'players must be unique and fit the selected seats'; end if;
  if exists(select 1 from unnest(v_players)x left join public.players p on p.id=x where p.id is null or p.status<>'active') then raise exception 'cup players must be active'; end if;
  delete from public.fixtures where tournament_id=v_t.id;
  delete from public.tournament_participants where tournament_id=v_t.id;
  update public.tournaments set seat_count=p_seat_count,status='draft' where id=v_t.id;
  insert into public.tournament_participants(tournament_id,player_id,seed)
  select v_t.id,x,ordinality from unnest(v_players) with ordinality p(x,ordinality);
end; $$;

create or replace function public.lock_tournament_draw_v2(p_tournament_id uuid,p_group_fixtures jsonb)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;v_count int;v_pairs int;v_locked timestamptz;
begin
  if not public.is_admin() then raise exception 'only organisers may lock a cup draw'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is not null then return v_t.draw_locked_at; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id=v_t.id;
  if v_t.schedule_locked_at is null or v_t.cover_image_url is null or v_count<>v_t.seat_count then raise exception 'complete every draw-lock checklist item'; end if;
  if v_t.championship_path='top_four_finals' and v_count<4 then raise exception 'top-four finals require four players'; end if;
  if jsonb_typeof(p_group_fixtures)<>'array' or jsonb_array_length(p_group_fixtures)<>v_count*(v_count-1)/2 then raise exception 'draw must contain every round-robin pairing'; end if;
  select count(distinct least((x->>'player1_id')::uuid,(x->>'player2_id')::uuid)::text||':'||greatest((x->>'player1_id')::uuid,(x->>'player2_id')::uuid)::text)
  into v_pairs from jsonb_array_elements(p_group_fixtures)x;
  if v_pairs<>v_count*(v_count-1)/2 or exists(
    select 1 from jsonb_array_elements(p_group_fixtures)x
    where (x->>'player1_id')::uuid=(x->>'player2_id')::uuid or (x->>'court_number')::int not between 1 and v_t.courts
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player1_id')::uuid)
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player2_id')::uuid)
  ) then raise exception 'draw contains invalid pairings'; end if;
  delete from public.fixtures where tournament_id=v_t.id;
  insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
  select v_t.id,'group',(x->>'round_number')::int,(x->>'slot_number')::int,(x->>'court_number')::int,v_t.group_ruleset,
    (x->>'player1_id')::uuid,(x->>'player2_id')::uuid from jsonb_array_elements(p_group_fixtures)x;
  v_locked:=now();update public.tournaments set draw_locked_at=v_locked,status='scheduled' where id=v_t.id;return v_locked;
end; $$;

create or replace function public.tournament_set_is_valid_v2(p_ruleset public.tournament_ruleset,p1 int,p2 int,t1 int,t2 int)
returns boolean language sql immutable set search_path='' as $$ select case
 when p_ruleset='short_first_to_3' then t1 is null and t2 is null and ((p1=3 and p2 between 0 and 2) or (p2=3 and p1 between 0 and 2))
 when p_ruleset='pro_set_8' then
   ((p1=8 and p2 between 0 and 6) or (p2=8 and p1 between 0 and 6) or (p1=9 and p2=7) or (p2=9 and p1=7)
    or (p1=9 and p2=8 and t1>=7 and t1-t2>=2 and (t1=7 or t1-t2=2))
    or (p2=9 and p1=8 and t2>=7 and t2-t1>=2 and (t2=7 or t2-t1=2)))
   and ((greatest(p1,p2)=9 and least(p1,p2)=8) or (t1 is null and t2 is null))
 else
   ((p1=6 and p2 between 0 and 4) or (p2=6 and p1 between 0 and 4) or (p1=7 and p2=5) or (p2=7 and p1=5)
    or (p1=7 and p2=6 and t1>=7 and t1-t2>=2 and (t1=7 or t1-t2=2))
    or (p2=7 and p1=6 and t2>=7 and t2-t1>=2 and (t2=7 or t2-t1=2)))
   and ((greatest(p1,p2)=7 and least(p1,p2)=6) or (t1 is null and t2 is null)) end $$;

create or replace function public.record_tournament_result_v2(p_fixture_id uuid,p_winner_id uuid,p_sets jsonb,p_played_at timestamptz,p_duration_minutes int default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_f record;v_id uuid;v_total int;v_p1 int;v_p2 int;
begin
 if not public.is_admin() then raise exception 'only organisers may record cup results'; end if;
 select f.*,t.status tournament_status,t.counts_as,t.court_id,t.default_surface into v_f from public.fixtures f join public.tournaments t on t.id=f.tournament_id where f.id=p_fixture_id for update of f;
 if not found or v_f.tournament_status not in('scheduled','live') then raise exception 'fixture is not accepting results'; end if;
 if p_winner_id not in(v_f.player1_id,v_f.player2_id) or exists(select 1 from public.matches where fixture_id=v_f.id) then raise exception 'invalid or completed fixture'; end if;
 if jsonb_typeof(p_sets)<>'array' then raise exception 'sets are required'; end if;
 v_total:=jsonb_array_length(p_sets);
 if (v_f.ruleset='best_of_3_standard' and v_total not between 2 and 3) or (v_f.ruleset<>'best_of_3_standard' and v_total<>1) then raise exception 'wrong number of sets for this format'; end if;
 if exists(select 1 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int)
   where set_number not between 1 and v_total or not public.tournament_set_is_valid_v2(case when v_f.ruleset='best_of_3_standard' then 'standard_set_tiebreak_6_all'::public.tournament_ruleset else v_f.ruleset end,p1_games,p2_games,tiebreak_p1,tiebreak_p2))
   or (select count(distinct set_number) from jsonb_to_recordset(p_sets)s(set_number int))<>v_total then raise exception 'score does not match the fixture format'; end if;
 select count(*)filter(where p1_games>p2_games),count(*)filter(where p2_games>p1_games) into v_p1,v_p2 from jsonb_to_recordset(p_sets)s(p1_games int,p2_games int);
 if (v_f.ruleset='best_of_3_standard' and (greatest(v_p1,v_p2)<>2 or (v_total=3 and (v_p1=0 or v_p2=0)))) or
    (p_winner_id=v_f.player1_id and v_p1<=v_p2) or (p_winner_id=v_f.player2_id and v_p2<=v_p1) then raise exception 'winner does not match the score'; end if;
 insert into public.matches(type,format,format_note,player1_id,player2_id,winner_id,status,submitted_by,played_at,duration_minutes,tournament_id,fixture_id,court_id,surface)
 values(v_f.counts_as,case v_f.ruleset when 'short_first_to_3' then 'custom'::public.match_format when 'pro_set_8' then 'pro_set_8'::public.match_format when 'best_of_3_standard' then 'best_of_3'::public.match_format else 'one_set'::public.match_format end,
   case when v_f.ruleset='short_first_to_3' then 'First to 3 games' end,v_f.player1_id,v_f.player2_id,p_winner_id,'pending_approval',auth.uid(),coalesce(p_played_at,now()),p_duration_minutes,v_f.tournament_id,v_f.id,v_f.court_id,v_f.default_surface) returning id into v_id;
 insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
 select v_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
 update public.matches set status='approved' where id=v_id;update public.tournaments set status='live' where id=v_f.tournament_id and status='scheduled';return v_id;
end; $$;

create or replace function public.complete_tournament_from_standings_v2(p_tournament_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;v_fixtures int;v_results int;v_first_wins int;v_second_wins int;
begin
 if not public.is_admin() then raise exception 'only organisers may complete cups'; end if;
 select * into v_t from public.tournaments where id=p_tournament_id for update;
 if not found or v_t.championship_path<>'standings' or v_t.status not in('scheduled','live') then raise exception 'cup cannot complete from standings'; end if;
 select count(*) into v_fixtures from public.fixtures where tournament_id=v_t.id and stage='group';
 select count(*) into v_results from public.fixtures f join public.matches m on m.fixture_id=f.id and m.status='approved' where f.tournament_id=v_t.id and f.stage='group';
 if v_fixtures=0 or v_results<>v_fixtures then raise exception 'complete every round-robin fixture first'; end if;
 with wins as(select p.player_id,p.seed,count(m.id)filter(where m.winner_id=p.player_id)::int won,
   coalesce(sum(case when m.player1_id=p.player_id then s.p1_games-s.p2_games else s.p2_games-s.p1_games end),0)::int diff
   from public.tournament_participants p left join public.fixtures f on f.tournament_id=p.tournament_id and f.stage='group' and p.player_id in(f.player1_id,f.player2_id)
   left join public.matches m on m.fixture_id=f.id and m.status='approved' left join public.match_sets s on s.match_id=m.id
   where p.tournament_id=v_t.id group by p.player_id,p.seed), ranked as(select won,row_number()over(order by won desc,diff desc,seed)rn from wins)
 select max(won)filter(where rn=1),max(won)filter(where rn=2) into v_first_wins,v_second_wins from ranked;
 if v_first_wins=v_second_wins and not exists(select 1 from public.fixtures f join public.matches m on m.fixture_id=f.id and m.status='approved' where f.tournament_id=v_t.id and f.stage='tiebreak') then raise exception 'complete the championship decider first'; end if;
 update public.tournaments set status='completed',completion_path='round_robin' where id=v_t.id;
end; $$;

revoke all on function public.guard_locked_tournament_configuration_v1() from public;
revoke all on function public.create_tournament_v2(text,timestamptz,text,uuid,int,public.surface,int,uuid[]) from public;
revoke all on function public.update_tournament_schedule_v1(uuid,timestamptz,text,uuid,int,public.surface) from public;
revoke all on function public.set_tournament_schedule_lock_v1(uuid,boolean) from public;
revoke all on function public.configure_tournament_competition_v1(uuid,public.tournament_ruleset,public.tournament_ruleset,public.tournament_championship_path) from public;
revoke all on function public.replace_tournament_roster_v1(uuid,int,uuid[]) from public;
revoke all on function public.lock_tournament_draw_v2(uuid,jsonb) from public;
revoke all on function public.record_tournament_result_v2(uuid,uuid,jsonb,timestamptz,int) from public;
revoke all on function public.complete_tournament_from_standings_v2(uuid) from public;
grant execute on function public.create_tournament_v2(text,timestamptz,text,uuid,int,public.surface,int,uuid[]) to authenticated;
grant execute on function public.update_tournament_schedule_v1(uuid,timestamptz,text,uuid,int,public.surface) to authenticated;
grant execute on function public.set_tournament_schedule_lock_v1(uuid,boolean) to authenticated;
grant execute on function public.configure_tournament_competition_v1(uuid,public.tournament_ruleset,public.tournament_ruleset,public.tournament_championship_path) to authenticated;
grant execute on function public.replace_tournament_roster_v1(uuid,int,uuid[]) to authenticated;
grant execute on function public.lock_tournament_draw_v2(uuid,jsonb) to authenticated;
grant execute on function public.record_tournament_result_v2(uuid,uuid,jsonb,timestamptz,int) to authenticated;
grant execute on function public.complete_tournament_from_standings_v2(uuid) to authenticated;

create or replace function public.core_backend_health_v2()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;v_guard boolean;
begin
  v_snapshot:=public.core_backend_health_v1();
  select exists(select 1 from pg_catalog.pg_trigger where tgname='guard_locked_tournament_configuration' and not tgisinternal) into v_guard;
  return jsonb_set(v_snapshot,'{infrastructure,triggers,guard_locked_tournament_configuration}',to_jsonb(v_guard),true);
end; $$;
revoke all on function public.core_backend_health_v2() from public;
grant execute on function public.core_backend_health_v2() to authenticated;
