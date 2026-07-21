begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('public','tournament_final_overrides','director final overrides are auditable facts');
select has_function('public','override_tournament_final_v1',array['uuid','uuid','uuid','text'],'guarded director final override exists');
select ok(has_function_privilege('authenticated','public.override_tournament_final_v1(uuid,uuid,uuid,text)','execute'),'authenticated organisers can reach the guarded override');
select ok(not has_function_privilege('anon','public.override_tournament_final_v1(uuid,uuid,uuid,text)','execute'),'anonymous users cannot reach the override');
select ok(not has_table_privilege('authenticated','public.tournament_final_overrides','insert'),'override facts cannot bypass the RPC');

insert into auth.users(id,email,raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001','override-a@test.invalid','{"first_name":"Finalist","last_name":"One"}'),
  ('a1000000-0000-0000-0000-000000000002','override-b@test.invalid','{"first_name":"Table","last_name":"Second"}'),
  ('a1000000-0000-0000-0000-000000000003','override-c@test.invalid','{"first_name":"Finalist","last_name":"Two"}'),
  ('a1000000-0000-0000-0000-000000000004','override-d@test.invalid','{"first_name":"Table","last_name":"Fourth"}'),
  ('a1000000-0000-0000-0000-000000000009','override-admin@test.invalid','{"first_name":"Cup","last_name":"Director"}');
update public.players set role='admin' where id='a1000000-0000-0000-0000-000000000009';

insert into public.tournaments(
  id,name,status,starts_at,location_name,courts,created_by,seat_count,championship_path,playoff_ruleset
) values(
  'a2000000-0000-0000-0000-000000000001','Override Cup','scheduled',now(),'Test',2,
  'a1000000-0000-0000-0000-000000000009',4,'standings','standard_set_tiebreak_6_all'
);
insert into public.tournament_participants(tournament_id,player_id,seed) values
  ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',1),
  ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',2),
  ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',3),
  ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004',4);
insert into public.fixtures(id,tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id) values
  ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','group',1,1,1,'short_first_to_3','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002'),
  ('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','group',1,1,2,'short_first_to_3','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000004'),
  ('a3000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','group',2,1,1,'short_first_to_3','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003'),
  ('a3000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000001','group',2,1,2,'short_first_to_3','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000004'),
  ('a3000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000001','group',3,1,1,'short_first_to_3','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004'),
  ('a3000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000001','group',3,1,2,'short_first_to_3','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003');

insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id,fixture_id) values
  ('a4000000-0000-0000-0000-000000000001','ranked','custom','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','pending_approval','a1000000-0000-0000-0000-000000000001',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001'),
  ('a4000000-0000-0000-0000-000000000002','ranked','custom','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','pending_approval','a1000000-0000-0000-0000-000000000003',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000002'),
  ('a4000000-0000-0000-0000-000000000003','ranked','custom','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003','pending_approval','a1000000-0000-0000-0000-000000000001',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003'),
  ('a4000000-0000-0000-0000-000000000004','ranked','custom','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002','pending_approval','a1000000-0000-0000-0000-000000000002',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000004'),
  ('a4000000-0000-0000-0000-000000000005','ranked','custom','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001','pending_approval','a1000000-0000-0000-0000-000000000001',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005'),
  ('a4000000-0000-0000-0000-000000000006','ranked','custom','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000002','pending_approval','a1000000-0000-0000-0000-000000000002',now(),'a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000006');
insert into public.match_sets(match_id,set_number,p1_games,p2_games) values
  ('a4000000-0000-0000-0000-000000000001',1,3,0),
  ('a4000000-0000-0000-0000-000000000002',1,3,0),
  ('a4000000-0000-0000-0000-000000000003',1,2,3),
  ('a4000000-0000-0000-0000-000000000004',1,3,0),
  ('a4000000-0000-0000-0000-000000000005',1,3,1),
  ('a4000000-0000-0000-0000-000000000006',1,3,1);
update public.matches set status='approved' where tournament_id='a2000000-0000-0000-0000-000000000001';
update public.tournaments set draw_locked_at=now() where id='a2000000-0000-0000-0000-000000000001';
select set_config('app.tournament_stage_rpc','on',true);
insert into public.fixtures(id,tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
values('a3000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000001','tiebreak',4,1,1,'standard_set_tiebreak_6_all','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003');
select set_config('app.tournament_stage_rpc','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.override_tournament_final_v1('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Director selected the championship finalists.')$$,'only active organisers may override cup qualification','ordinary players cannot override qualification');
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000009',true);
select ok(public.override_tournament_final_v1('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Director selected the championship finalists.'),'director override commits');
select is((select finalist_one_id from public.tournament_final_overrides where tournament_id='a2000000-0000-0000-0000-000000000001'),'a1000000-0000-0000-0000-000000000001'::uuid,'first finalist is audited');
select is((select finalist_two_id from public.tournament_final_overrides where tournament_id='a2000000-0000-0000-0000-000000000001'),'a1000000-0000-0000-0000-000000000003'::uuid,'second finalist is audited');
select ok((select skipped_at is not null from public.fixtures where tournament_id='a2000000-0000-0000-0000-000000000001' and stage='tiebreak'),'unplayed decider is preserved as skipped');
select is((select count(*) from public.fixtures where tournament_id='a2000000-0000-0000-0000-000000000001' and stage='group'),6::bigint,'all group fixtures are preserved');
select is((select count(*) from public.matches where tournament_id='a2000000-0000-0000-0000-000000000001'),6::bigint,'all group match facts are preserved');
select is((select ruleset from public.fixtures where tournament_id='a2000000-0000-0000-0000-000000000001' and stage='final'),'best_of_3_standard'::public.tournament_ruleset,'override final is best of three');
select is((select array[player1_id,player2_id] from public.fixtures where tournament_id='a2000000-0000-0000-0000-000000000001' and stage='final'),array['a1000000-0000-0000-0000-000000000001'::uuid,'a1000000-0000-0000-0000-000000000003'::uuid],'override installs the selected final');
select ok(not public.override_tournament_final_v1('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Director selected the championship finalists.'),'exact override retry is idempotent');
select throws_ok($$select public.override_tournament_final_v1('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Director selected different championship finalists.')$$,'qualification override conflicts with the recorded director decision','conflicting override retry is rejected');
select throws_ok($$select public.finalize_tournament_v1('a2000000-0000-0000-0000-000000000001','final_stage','[]')$$,'complete the final first','completion waits for the real final');
reset role;

insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id,fixture_id)
select 'a4000000-0000-0000-0000-000000000007','ranked','best_of_3',player1_id,player2_id,player2_id,'pending_approval',player1_id,now(),tournament_id,id
from public.fixtures where tournament_id='a2000000-0000-0000-0000-000000000001' and stage='final';
insert into public.match_sets(match_id,set_number,p1_games,p2_games) values
  ('a4000000-0000-0000-0000-000000000007',1,4,6),
  ('a4000000-0000-0000-0000-000000000007',2,3,6);
update public.matches set status='approved' where id='a4000000-0000-0000-0000-000000000007';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000009',true);
select ok(not public.override_tournament_final_v1('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Director selected the championship finalists.'),'exact override retry stays safe after final scoring starts');
select lives_ok($$select public.finalize_tournament_v1('a2000000-0000-0000-0000-000000000001','final_stage','[{"player_id":"a1000000-0000-0000-0000-000000000003","placement":1,"points":100},{"player_id":"a1000000-0000-0000-0000-000000000001","placement":2,"points":50},{"player_id":"a1000000-0000-0000-0000-000000000002","placement":3,"points":20},{"player_id":"a1000000-0000-0000-0000-000000000004","placement":4,"points":10}]')$$,'override completion commits from the real final and table remainder');
reset role;
select is((select status from public.tournaments where id='a2000000-0000-0000-0000-000000000001'),'completed'::public.tournament_status,'override cup completes');
select is((select array_agg(player_id order by placement) from public.tournament_placements where tournament_id='a2000000-0000-0000-0000-000000000001'),array['a1000000-0000-0000-0000-000000000003'::uuid,'a1000000-0000-0000-0000-000000000001'::uuid,'a1000000-0000-0000-0000-000000000002'::uuid,'a1000000-0000-0000-0000-000000000004'::uuid],'official placements use final winner, finalist, then table order');
select is((select count(*) from public.custom_email_outbox where entity_id='a2000000-0000-0000-0000-000000000001' and kind like 'tournament_result_%'),4::bigint,'all override placements receive result-email intents');

select * from finish();
rollback;
