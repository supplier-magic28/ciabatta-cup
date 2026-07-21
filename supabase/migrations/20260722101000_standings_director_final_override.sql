-- Claymore was configured to finish from standings, so its qualification
-- decider protects first place rather than the top-two cutoff. Broaden the
-- audited four-player escape hatch to that existing path without rewriting the
-- already-applied migration or weakening any result/fact boundary.

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
  if v_t.championship_path not in('standings','top_two_final')
  then raise exception 'director final override requires the standings or top-two-final path'; end if;

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

  select * into v_override from public.tournament_final_overrides where tournament_id=v_t.id;
  if found then
    if v_override.finalist_one_id is distinct from p_finalist_one_id
      or v_override.finalist_two_id is distinct from p_finalist_two_id
      or v_override.reason is distinct from v_reason
    then raise exception 'qualification override conflicts with the recorded director decision'; end if;
    return false;
  end if;

  if exists(
    select 1 from public.matches m join public.fixtures f on f.id=m.fixture_id
    where f.tournament_id=v_t.id and f.stage<>'group'
  ) then raise exception 'qualification override is closed after a championship-stage result starts'; end if;
  if exists(
    select 1 from public.fixtures
    where tournament_id=v_t.id and stage<>'group' and stage<>'tiebreak'
  ) then raise exception 'qualification override requires an unplayed decider-only stage'; end if;

  select coalesce(max(round_number),0)+1 into v_round
  from public.fixtures where tournament_id=v_t.id and stage='group';

  insert into public.tournament_final_overrides(
    tournament_id,finalist_one_id,finalist_two_id,reason,created_by
  ) values(v_t.id,p_finalist_one_id,p_finalist_two_id,v_reason,auth.uid());

  perform pg_catalog.set_config('app.tournament_stage_rpc','on',true);
  update public.fixtures set skipped_at=coalesce(skipped_at,now())
    where tournament_id=v_t.id and stage='tiebreak';
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
