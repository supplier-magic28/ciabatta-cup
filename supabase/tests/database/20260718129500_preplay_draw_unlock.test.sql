begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function('public','unlock_tournament_draw_v1',array['uuid'],'guarded draw unlock exists');
select ok(has_function_privilege('authenticated','public.unlock_tournament_draw_v1(uuid)','execute'),'authenticated organisers can reach guarded draw unlock');
select ok(not has_function_privilege('anon','public.unlock_tournament_draw_v1(uuid)','execute'),'anonymous callers cannot unlock draws');
select ok(not has_table_privilege('authenticated','public.tournaments','update'),'draw lock cannot be bypassed with direct tournament updates');

insert into auth.users(id,email,raw_user_meta_data) values
  ('91000000-0000-0000-0000-000000000001','player-1295@test.invalid','{"first_name":"Active","last_name":"Player"}'),
  ('91000000-0000-0000-0000-000000000002','admin-1295@test.invalid','{"first_name":"Active","last_name":"Admin"}');
update public.players set role='admin' where id='91000000-0000-0000-0000-000000000002';

-- Build each cup while it is unlocked. Locking before these inserts would make
-- the fixture invalid by testing the old participant guard instead of the new
-- draw-unlock boundary.
insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count,schedule_locked_at)
values
  ('92000000-0000-0000-0000-000000000001','Editable Locked Cup','scheduled',now()+interval '1 day','Test',1,'91000000-0000-0000-0000-000000000002',2,now()),
  ('92000000-0000-0000-0000-000000000002','Started Locked Cup','scheduled',now()+interval '1 day','Test',1,'91000000-0000-0000-0000-000000000002',2,now()),
  ('92000000-0000-0000-0000-000000000003','Placed Locked Cup','scheduled',now()+interval '1 day','Test',1,'91000000-0000-0000-0000-000000000002',2,now());
insert into public.tournament_participants(tournament_id,player_id,seed)
select tournament_id,player_id,seed from (values
  ('92000000-0000-0000-0000-000000000001'::uuid,'91000000-0000-0000-0000-000000000001'::uuid,1),
  ('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002',2),
  ('92000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000001',1),
  ('92000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002',2),
  ('92000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000001',1),
  ('92000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000002',2)
) roster(tournament_id,player_id,seed);
insert into public.fixtures(id,tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id) values
  ('94000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','group',1,1,1,'short_first_to_3','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002'),
  ('94000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','group',1,1,1,'short_first_to_3','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002'),
  ('94000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000003','group',1,1,1,'short_first_to_3','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002');
update public.tournaments set draw_locked_at=now() where id in(
  '92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000003'
);

insert into public.matches(id,type,format,player1_id,player2_id,status,submitted_by,played_at,tournament_id,fixture_id)
values('93000000-0000-0000-0000-000000000001','ranked','one_set','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002','pending_confirmation','91000000-0000-0000-0000-000000000001',now(),'92000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002');
select set_config('app.tournament_completion_rpc','on',true);
insert into public.tournament_placements(tournament_id,player_id,placement,points)
values('92000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000001',1,100);
select set_config('app.tournament_completion_rpc','off',true);

select throws_ok($$update public.tournaments set draw_locked_at=null where id='92000000-0000-0000-0000-000000000001'$$,'the draw lock can change only through the guarded unlock workflow','trusted direct update cannot bypass the draw unlock RPC');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.unlock_tournament_draw_v1('92000000-0000-0000-0000-000000000001')$$,'only active organisers may unlock cup draws','ordinary players cannot unlock a draw');
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
select is(public.unlock_tournament_draw_v1('92000000-0000-0000-0000-000000000001'),true,'organiser unlocks a pre-play draw');
select is((select draw_locked_at from public.tournaments where id='92000000-0000-0000-0000-000000000001'),null::timestamptz,'unlock clears the draw milestone');
select is((select status::text from public.tournaments where id='92000000-0000-0000-0000-000000000001'),'draft','unlock reopens cup configuration');
select is((select count(*) from public.fixtures where tournament_id='92000000-0000-0000-0000-000000000001'),1::bigint,'unlock preserves the draw preview');
select is((select count(*) from public.tournament_participants where tournament_id='92000000-0000-0000-0000-000000000001'),2::bigint,'unlock preserves the roster');
select is(public.unlock_tournament_draw_v1('92000000-0000-0000-0000-000000000001'),false,'unlock retry is idempotent');
select throws_ok($$select public.unlock_tournament_draw_v1('92000000-0000-0000-0000-000000000002')$$,'cup draw has a recorded result and cannot be unlocked','a recorded match makes the draw final');
select throws_ok($$select public.unlock_tournament_draw_v1('92000000-0000-0000-0000-000000000003')$$,'cup draw has a recorded result and cannot be unlocked','a placement fact makes the draw final');

select * from finish();
rollback;
