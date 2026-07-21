begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_function('public','record_tournament_result_v2',array['uuid','uuid','jsonb','timestamp with time zone','integer'],'compatible tournament result RPC remains installed');

insert into auth.users(id,email,raw_user_meta_data) values
  ('b1000000-0000-0000-0000-000000000001','event-player-one@test.invalid','{"first_name":"Event","last_name":"One"}'),
  ('b1000000-0000-0000-0000-000000000002','event-player-two@test.invalid','{"first_name":"Event","last_name":"Two"}'),
  ('b1000000-0000-0000-0000-000000000009','event-director@test.invalid','{"first_name":"Event","last_name":"Director"}');
update public.players set role='admin' where id='b1000000-0000-0000-0000-000000000009';

insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count)
values('b2000000-0000-0000-0000-000000000001','Event Date Cup','scheduled','2026-07-18 00:30:00+00','Test',1,'b1000000-0000-0000-0000-000000000009',2);
insert into public.tournament_participants(tournament_id,player_id,seed) values
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',1),
  ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',2);
insert into public.fixtures(id,tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
values('b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','group',1,1,1,'short_first_to_3','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002');

create temp table event_date_version_before as select fact_version from public.scoring_cache_state where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000009',true);
select lives_ok($$select public.record_tournament_result_v2(
  'b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
  '[{"set_number":1,"p1_games":3,"p2_games":1,"tiebreak_p1":null,"tiebreak_p2":null}]',
  '2026-07-21 22:30:00+00',null
)$$,'director records a cup result through the compatible RPC');
reset role;

select is((select played_at from public.matches where fixture_id='b3000000-0000-0000-0000-000000000001'),'2026-07-18 00:30:00+00'::timestamptz,'cup result uses the scheduled event time instead of entry time');
select is((select fact_version from public.scoring_cache_state where singleton),(select fact_version+1 from event_date_version_before),'one tournament tennis-day fact advances the scoring source version once');
select is((select status from public.matches where fixture_id='b3000000-0000-0000-0000-000000000001'),'approved'::public.match_status,'timestamp ownership does not change atomic approval');

select * from finish();
rollback;
