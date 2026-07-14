begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_column('public','matches','operation_key','matches carry idempotency keys');
select has_column('public','planned_matches','operation_key','planned shells carry idempotency keys');
select has_table('public','scoring_cache_state','scoring fact/cache versions are durable');
select has_table('public','lifecycle_email_deliveries','lifecycle email diagnostics are durable');
select has_function('public','assert_standard_match_payload_v1',array['jsonb','uuid','uuid','uuid','timestamp with time zone','match_format','text'],'shared score validator exists');
select has_function('public','submit_match_v3',array['uuid','uuid','match_type','match_format','text','uuid','timestamp with time zone','text','uuid','surface','jsonb'],'idempotent member creation RPC exists');
select has_function('public','admin_log_match_v2',array['uuid','uuid','uuid','match_type','match_format','text','uuid','timestamp with time zone','text','uuid','surface','jsonb'],'idempotent organiser creation RPC exists');
select has_function('public','confirm_match_v1',array['uuid'],'idempotent confirmation RPC exists');

select lives_ok($test$
  select public.assert_standard_match_payload_v1(
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]',
    '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',now(),'one_set',null)
$test$,'valid score is accepted');
select throws_ok($test$
  select public.assert_standard_match_payload_v1(
    '[{"set_number":2,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]',
    '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',now(),'one_set',null)
$test$,'sets must be valid and sequential','non-sequential score is rejected');
select throws_ok($test$
  select public.assert_standard_match_payload_v1(
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]',
    '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000020',now(),'one_set',null)
$test$,'score must agree with the winner','mismatched winner is rejected');
select throws_ok($test$
  select public.assert_standard_match_payload_v1(
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]',
    '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',now()+interval '2 days','one_set',null)
$test$,'match date cannot be in the future','Melbourne future dates are rejected');
select throws_ok($test$
  select public.assert_standard_match_payload_v1(
    '[{"set_number":1,"p1_games":6,"p2_games":4,"tiebreak_p1":null,"tiebreak_p2":null}]',
    '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',now(),'custom',null)
$test$,'custom formats require a note and standard formats cannot store one','custom formats require notes');

select ok(has_function_privilege('authenticated','public.submit_match_v3(uuid,uuid,match_type,match_format,text,uuid,timestamptz,text,uuid,surface,jsonb)','execute'),'authenticated can call member RPC');
select ok(not has_function_privilege('anon','public.submit_match_v3(uuid,uuid,match_type,match_format,text,uuid,timestamptz,text,uuid,surface,jsonb)','execute'),'anonymous cannot call member RPC');
select ok(has_function_privilege('service_role','public.replace_rating_cache_with_reigns_v2(jsonb,jsonb,jsonb,bigint)','execute'),'service role can replace versioned cache');
select ok(not has_function_privilege('authenticated','public.replace_rating_cache_with_reigns_v2(jsonb,jsonb,jsonb,bigint)','execute'),'players cannot replace derived cache');
select ok(has_table_privilege('authenticated','public.matches','select'),'authenticated reads pass through match RLS');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='matches' and policyname='matches_insert_participant'),'direct member match inserts are retired');
select ok(exists(select 1 from pg_trigger where tgname='guard_match_status_graph' and not tgisinternal),'match graph guard is installed');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'),'notification realtime publication remains enabled');

select has_function('public','core_backend_health_v1',array[]::text[],'organiser health RPC exists');
select ok(has_function_privilege('authenticated','public.core_backend_health_v1()','execute'),'authenticated role can reach the guarded health RPC');
select ok(not has_function_privilege('anon','public.core_backend_health_v1()','execute'),'anonymous role cannot inspect health');

insert into auth.users(id,email,raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001','health-player@test.invalid','{"first_name":"Health","last_name":"Player"}'),
  ('30000000-0000-0000-0000-000000000002','health-admin@test.invalid','{"first_name":"Health","last_name":"Admin"}');
update public.players set role='admin' where id='30000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select throws_ok(
  'select public.core_backend_health_v1()',
  'only organisers may inspect backend health',
  'ordinary players cannot inspect health'
);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select lives_ok('select public.core_backend_health_v1()','organisers can inspect health');
select ok(
  (public.core_backend_health_v1()->'infrastructure'->>'notificationsRealtime')::boolean,
  'health snapshot reports notification Realtime'
);

select * from finish();
rollback;
