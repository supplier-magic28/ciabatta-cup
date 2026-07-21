-- Preserve every approved group result while allowing an organiser to replace
-- an unplayed qualification stage with one explicitly seeded best-of-three
-- final. The remaining players retain their canonical table order as third
-- and fourth; the override is an auditable fact, not a fabricated match.

create table public.tournament_final_overrides (
  tournament_id uuid primary key references public.tournaments(id) on delete restrict,
  finalist_one_id uuid not null,
  finalist_two_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_by uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint tournament_final_override_distinct_finalists
    check (finalist_one_id <> finalist_two_id),
  constraint tournament_final_override_first_participant
    foreign key (tournament_id,finalist_one_id)
    references public.tournament_participants(tournament_id,player_id) on delete restrict,
  constraint tournament_final_override_second_participant
    foreign key (tournament_id,finalist_two_id)
    references public.tournament_participants(tournament_id,player_id) on delete restrict
);

alter table public.tournament_final_overrides enable row level security;
create policy "active_players_read_tournament_final_overrides"
  on public.tournament_final_overrides for select to authenticated
  using (public.is_active_player());
revoke insert,update,delete on public.tournament_final_overrides from authenticated,service_role;
grant select on public.tournament_final_overrides to authenticated,service_role;

create or replace function public.override_tournament_final_v1(
  p_tournament_id uuid,
  p_finalist_one_id uuid,
  p_finalist_two_id uuid,
  p_reason text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_override public.tournament_final_overrides%rowtype;
  v_participant_count int;
  v_selected_count int;
  v_group_count int;
  v_group_result_count int;
  v_round int;
  v_reason text:=btrim(p_reason);
begin
  if not public.is_admin() then raise exception 'only active organisers may override cup qualification'; end if;
  if p_tournament_id is null or p_finalist_one_id is null or p_finalist_two_id is null
    or p_finalist_one_id=p_finalist_two_id
  then raise exception 'choose two distinct finalists'; end if;
  if char_length(coalesce(v_reason,'')) not between 10 and 500
  then raise exception 'record a 10 to 500 character override reason'; end if;

  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is null then raise exception 'lock the draw before overriding qualification'; end if;
  if v_t.status not in('scheduled','live') or v_t.completion_path is not null
    or exists(select 1 from public.tournament_placements where tournament_id=v_t.id)
  then raise exception 'cup can no longer override qualification'; end if;
  if v_t.championship_path<>'top_two_final'
  then raise exception 'director final override requires the top-two-final path'; end if;

  select count(*),count(*) filter(where player_id in(p_finalist_one_id,p_finalist_two_id))
    into v_participant_count,v_selected_count
  from public.tournament_participants where tournament_id=v_t.id;
  if v_participant_count<>4 or v_selected_count<>2
  then raise exception 'director final override requires two finalists from a four-player cup'; end if;

  select count(*),count(distinct f.id) filter(where m.id is not null)
    into v_group_count,v_group_result_count
  from public.fixtures f
  left join public.matches m on m.fixture_id=f.id and m.status='approved'
  where f.tournament_id=v_t.id and f.stage='group';
  if v_group_count<>6 or v_group_result_count<>v_group_count
  then raise exception 'complete every round-robin fixture first'; end if;
  if exists(
    select 1 from public.matches m join public.fixtures f on f.id=m.fixture_id
    where f.tournament_id=v_t.id and f.stage<>'group'
  ) then raise exception 'qualification override is closed after a championship-stage result starts'; end if;

  select * into v_override from public.tournament_final_overrides where tournament_id=v_t.id;
  if found then
    if v_override.finalist_one_id is distinct from p_finalist_one_id
      or v_override.finalist_two_id is distinct from p_finalist_two_id
      or v_override.reason is distinct from v_reason
    then raise exception 'qualification override conflicts with the recorded director decision'; end if;
    return false;
  end if;

  select coalesce(max(round_number),0)+1 into v_round
  from public.fixtures where tournament_id=v_t.id and stage='group';

  insert into public.tournament_final_overrides(
    tournament_id,finalist_one_id,finalist_two_id,reason,created_by
  ) values(v_t.id,p_finalist_one_id,p_finalist_two_id,v_reason,auth.uid());

  perform pg_catalog.set_config('app.tournament_stage_rpc','on',true);
  delete from public.fixtures where tournament_id=v_t.id and stage<>'group';
  insert into public.fixtures(
    tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id
  ) values(
    v_t.id,'final',v_round,1,1,'best_of_3_standard',p_finalist_one_id,p_finalist_two_id
  );
  perform pg_catalog.set_config('app.tournament_stage_rpc','',true);
  return true;
end;
$$;
revoke all on function public.override_tournament_final_v1(uuid,uuid,uuid,text) from public;
grant execute on function public.override_tournament_final_v1(uuid,uuid,uuid,text) to authenticated;

-- Keep the existing finalizer signature. Normal cups still use the canonical
-- placement function; an override cup derives 1/2 from its real final and
-- keeps the non-finalists in their canonical group-table order.
create or replace function public.finalize_tournament_v1(
  p_tournament_id uuid,p_completion_path public.tournament_completion_path,p_placements jsonb
) returns void language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_override public.tournament_final_overrides%rowtype;
  v_final record;
  v_player_order uuid[];
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

  select * into v_override from public.tournament_final_overrides where tournament_id=v_t.id;
  if found then
    if p_completion_path<>'final_stage' then raise exception 'wrong completion path'; end if;
    select f.player1_id,f.player2_id,m.winner_id into v_final
    from public.fixtures f left join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='final';
    if not found or v_final.player1_id is distinct from v_override.finalist_one_id
      or v_final.player2_id is distinct from v_override.finalist_two_id
    then raise exception 'install the director-seeded final first'; end if;
    if v_final.winner_id is null then raise exception 'complete the final first'; end if;
    select array[
      v_final.winner_id,
      case when v_final.winner_id=v_final.player1_id then v_final.player2_id else v_final.player1_id end
    ] || array_agg(s.player_id order by s.standing)
      filter(where s.player_id not in(v_override.finalist_one_id,v_override.finalist_two_id))
      into v_player_order
    from public.tournament_standings_v1(v_t.id)s;
    select jsonb_agg(jsonb_build_object(
      'player_id',x.player_id,'placement',x.placement,
      'points',case x.placement when 1 then 100 when 2 then 50 when 3 then 20 when 4 then 10 else 0 end
    ) order by x.placement)
      into v_expected
    from unnest(v_player_order) with ordinality x(player_id,placement);
  else
    select jsonb_agg(jsonb_build_object('player_id',p.player_id,'placement',p.placement,'points',p.points) order by p.placement)
      into v_expected from public.canonical_tournament_placements_v1(v_t.id,p_completion_path)p;
  end if;

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
