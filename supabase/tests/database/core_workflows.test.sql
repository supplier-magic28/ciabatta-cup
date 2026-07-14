begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users(id,email,raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001','one@test.invalid','{"first_name":"One","last_name":"Player"}'),
  ('10000000-0000-0000-0000-000000000002','two@test.invalid','{"first_name":"Two","last_name":"Player"}'),
  ('10000000-0000-0000-0000-000000000003','three@test.invalid','{"first_name":"Three","last_name":"Player"}'),
  ('10000000-0000-0000-0000-000000000004','admin@test.invalid','{"first_name":"Admin","last_name":"Player"}');
update public.players set role='admin' where id='10000000-0000-0000-0000-000000000004';
create temporary table workflow_ids(kind text primary key,id uuid not null);
grant select,insert,update,delete on workflow_ids to authenticated;
grant select on public.matches,public.match_sets,public.match_confirmations,public.notifications to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($test$
  insert into workflow_ids values('member',public.submit_match_v3(
    '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    'exhibition','one_set',null,'10000000-0000-0000-0000-000000000001',now(),null,null,'synthetic',
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]'))
$test$,'member creation commits atomically');
select is((select count(*) from public.match_sets where match_id=(select id from workflow_ids where kind='member')),1::bigint,'member score rows commit with the match');
select is((select count(*) from public.match_confirmations where match_id=(select id from workflow_ids where kind='member')),1::bigint,'submitter confirmation commits with the match');
select is(public.submit_match_v3(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  'exhibition','one_set',null,'10000000-0000-0000-0000-000000000001',now(),null,null,'synthetic',
  '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]'),
  (select id from workflow_ids where kind='member'),'repeating an operation key returns the original match');
select is((select count(*) from public.matches where operation_key='20000000-0000-0000-0000-000000000001'),1::bigint,'retry creates no duplicate match');
select throws_ok($test$
  select public.submit_match_v3(
    '20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
    'exhibition','one_set',null,'10000000-0000-0000-0000-000000000002',now(),null,null,'synthetic',
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]')
$test$,'score must agree with the winner','invalid creation rolls back');
select is((select count(*) from public.matches where operation_key='20000000-0000-0000-0000-000000000002'),0::bigint,'failed creation leaves no match');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select throws_ok(format('select public.confirm_match_v1(%L)',(select id from workflow_ids where kind='member')),'match not found','unrelated player cannot confirm');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is(public.confirm_match_v1((select id from workflow_ids where kind='member')),'approved'::public.match_status,'opponent confirmation advances exhibition atomically');
select is((select count(*) from public.match_confirmations where match_id=(select id from workflow_ids where kind='member')),2::bigint,'confirmation retry boundary records each participant once');
select is(public.confirm_match_v1((select id from workflow_ids where kind='member')),'approved'::public.match_status,'repeated confirmation returns the committed status');
select is((select count(*) from public.match_confirmations where match_id=(select id from workflow_ids where kind='member')),2::bigint,'repeated confirmation creates no extra row');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into workflow_ids values('review',public.submit_match_v3(
  '20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002',
  'ranked','one_set',null,'10000000-0000-0000-0000-000000000001',now(),null,null,'synthetic',
  '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]'));
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is(public.confirm_match_v1((select id from workflow_ids where kind='review')),'pending_approval'::public.match_status,'ranked confirmation reaches organiser review');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is(public.review_match_v2((select id from workflow_ids where kind='review'),'approved'),'approved'::public.match_status,'organiser approval commits');
select is(public.review_match_v2((select id from workflow_ids where kind='review'),'approved'),'approved'::public.match_status,'matching review retry returns its existing outcome');
select throws_ok(
  format('select public.review_match_v2(%L,''rejected'')',(select id from workflow_ids where kind='review')),
  'conflicting terminal review','conflicting review retry fails');
select lives_ok($test$
  insert into workflow_ids values('admin',public.admin_log_match_v2(
    '20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    'ranked','one_set',null,'10000000-0000-0000-0000-000000000001',now(),null,null,'synthetic',
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]'))
$test$,'organiser creation commits and approves atomically');
select is((select status from public.matches where id=(select id from workflow_ids where kind='admin')),'approved'::public.match_status,'organiser result is immediately approved');
select is((select count(*) from public.match_confirmations where match_id=(select id from workflow_ids where kind='admin')),0::bigint,'organiser result creates no participant confirmation work');
select is(public.admin_log_match_v2(
  '20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  'ranked','one_set',null,'10000000-0000-0000-0000-000000000001',now(),null,null,'synthetic',
  '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]'),
  (select id from workflow_ids where kind='admin'),'organiser operation-key retry returns its original fact');
select is((select count(*) from public.matches where operation_key='20000000-0000-0000-0000-000000000003'),1::bigint,'organiser retry creates no duplicate fact');

select * from finish();
rollback;
