begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_column('public','tournaments','seat_count','cups persist 2-8 seat capacity');
select has_column('public','tournaments','schedule_locked_at','schedule lock is explicit');
select has_column('public','tournaments','championship_path','championship path is separate from result completion');
select has_column('public','tournaments','cover_frame_shape','cover frame remains editable presentation');
select has_column('public','tournaments','cover_zoom','cover zoom is normalized metadata');
select has_function('public','create_tournament_v2',array['text','timestamp with time zone','text','uuid','integer','surface','integer','uuid[]'],'atomic partial cup creation exists');
select has_function('public','update_tournament_schedule_v1',array['uuid','timestamp with time zone','text','uuid','integer','surface'],'guarded schedule editing exists');
select has_function('public','set_tournament_schedule_lock_v1',array['uuid','boolean'],'reversible pre-draw schedule lock exists');
select has_function('public','configure_tournament_competition_v1',array['uuid','tournament_ruleset','tournament_ruleset','tournament_championship_path'],'independent competition configuration exists');
select has_function('public','replace_tournament_roster_v1',array['uuid','integer','uuid[]'],'atomic ordered roster replacement exists');
select has_function('public','lock_tournament_draw_v2',array['uuid','jsonb'],'atomic permanent draw lock exists');
select has_function('public','record_tournament_result_v2',array['uuid','uuid','jsonb','timestamp with time zone','integer'],'multi-set result RPC exists');
select ok(has_function_privilege('authenticated','public.lock_tournament_draw_v2(uuid,jsonb)','execute'),'authenticated organisers can reach guarded draw lock');
select ok(not has_function_privilege('anon','public.lock_tournament_draw_v2(uuid,jsonb)','execute'),'anonymous callers cannot lock draws');
select ok(exists(select 1 from pg_trigger where tgname='guard_locked_tournament_configuration' and not tgisinternal),'locked configuration guard is installed');
select lives_ok($test$select public.tournament_set_is_valid_v2('pro_set_8',9,8,10,8)$test$,'valid 9-8 pro-set tiebreak is accepted');
select ok(public.tournament_set_is_valid_v2('standard_set_tiebreak_6_all',7,6,7,5),'valid standard-set tiebreak is accepted');
select ok(not public.tournament_set_is_valid_v2('pro_set_8',8,8,null,null),'unfinished pro set is rejected');

select * from finish();
rollback;
