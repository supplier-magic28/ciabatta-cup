-- Canonical single-day tournament activity dates (ADR-0049).
-- Keep the public v2 result signature compatible while moving timestamp
-- ownership to the locked tournament schedule.

create or replace function public.record_tournament_result_v2(
  p_fixture_id uuid,p_winner_id uuid,p_sets jsonb,p_played_at timestamptz,p_duration_minutes int default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_f record;v_id uuid;v_total int;v_p1 int;v_p2 int;
begin
 if not public.is_admin() then raise exception 'only organisers may record cup results'; end if;
 select f.*,t.status tournament_status,t.counts_as,t.court_id,t.default_surface,t.starts_at into v_f
 from public.fixtures f join public.tournaments t on t.id=f.tournament_id
 where f.id=p_fixture_id for update of f;
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
   case when v_f.ruleset='short_first_to_3' then 'First to 3 games' end,v_f.player1_id,v_f.player2_id,p_winner_id,'pending_approval',auth.uid(),v_f.starts_at,p_duration_minutes,v_f.tournament_id,v_f.id,v_f.court_id,v_f.default_surface) returning id into v_id;
 insert into public.match_sets(match_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)
 select v_id,set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2 from jsonb_to_recordset(p_sets)s(set_number int,p1_games int,p2_games int,tiebreak_p1 int,tiebreak_p2 int);
 update public.matches set status='approved' where id=v_id;
 update public.tournaments set status='live' where id=v_f.tournament_id and status='scheduled';
 return v_id;
end; $$;

-- A non-rejected match supplies a tennis day. An approved non-tournament
-- match additionally supplies an award. Advance the source version only when
-- either canonical contribution changes.
create or replace function public.bump_scoring_match_version_v2()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_changed boolean:=false;v_old_award boolean:=false;v_new_award boolean:=false;
begin
  if tg_op='INSERT' then
    v_changed:=new.status<>'rejected' or (new.status='approved' and new.tournament_id is null);
  elsif tg_op='DELETE' then
    v_changed:=old.status<>'rejected' or (old.status='approved' and old.tournament_id is null);
  else
    v_old_award:=old.status='approved' and old.tournament_id is null;
    v_new_award:=new.status='approved' and new.tournament_id is null;
    v_changed:=(old.status<>'rejected') is distinct from (new.status<>'rejected')
      or ((old.status<>'rejected') and (new.status<>'rejected') and (
        old.player1_id is distinct from new.player1_id or old.player2_id is distinct from new.player2_id
        or old.played_at is distinct from new.played_at or old.tournament_id is distinct from new.tournament_id
      ))
      or v_old_award is distinct from v_new_award
      or (v_old_award and v_new_award and (
        old.type is distinct from new.type or old.player1_id is distinct from new.player1_id
        or old.player2_id is distinct from new.player2_id or old.winner_id is distinct from new.winner_id
        or old.played_at is distinct from new.played_at
      ));
  end if;
  if v_changed then update public.scoring_cache_state set fact_version=fact_version+1 where singleton; end if;
  return null;
end; $$;

revoke all on function public.record_tournament_result_v2(uuid,uuid,jsonb,timestamptz,int) from public;
revoke all on function public.bump_scoring_match_version_v2() from public;
grant execute on function public.record_tournament_result_v2(uuid,uuid,jsonb,timestamptz,int) to authenticated;
