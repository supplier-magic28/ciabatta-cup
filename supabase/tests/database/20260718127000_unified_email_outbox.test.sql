begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select has_table('public','custom_email_outbox','one custom email outbox is durable');
select has_column('public','custom_email_outbox','kind','outbox records reconstructable kind');
select has_column('public','custom_email_outbox','player_id','outbox records canonical recipient');
select has_column('public','custom_email_outbox','entity_type','outbox records entity type');
select has_column('public','custom_email_outbox','entity_id','outbox records entity id');
select has_column('public','custom_email_outbox','status','outbox records delivery state');
select has_column('public','custom_email_outbox','attempt_count','outbox records attempts');
select has_column('public','custom_email_outbox','superseded_at','outbox records terminal supersession time');
select has_function('public','enqueue_custom_email_v1',array['text','text','uuid','text','uuid'],'intent enqueue RPC exists');
select has_function('public','claim_custom_email_v1',array['text'],'atomic delivery claim RPC exists');
select has_function('public','mark_custom_email_sent_v1',array['text','text'],'sent receipt RPC exists');
select has_function('public','mark_custom_email_failed_v1',array['text','text'],'failed receipt RPC exists');
select has_function('public','supersede_custom_email_v1',array['text'],'terminal supersession RPC exists');
select ok(not has_function_privilege('authenticated','public.enqueue_custom_email_v1(text,text,uuid,text,uuid)','execute'),'members cannot create arbitrary email intents');
select ok(has_function_privilege('service_role','public.enqueue_custom_email_v1(text,text,uuid,text,uuid)','execute'),'trusted server can ensure an email intent');
select ok(not has_function_privilege('authenticated','public.claim_custom_email_v1(text)','execute'),'members cannot claim email work');
select ok(has_function_privilege('service_role','public.claim_custom_email_v1(text)','execute'),'trusted server can claim email work');
select ok(not has_function_privilege('authenticated','public.supersede_custom_email_v1(text)','execute'),'members cannot supersede email facts');
select ok(has_function_privilege('service_role','public.supersede_custom_email_v1(text)','execute'),'trusted server can supersede obsolete work');
select ok((select relrowsecurity from pg_class where oid='public.custom_email_outbox'::regclass),'outbox RLS is enabled');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_match_custom_emails' and not tgisinternal),'match intent trigger is installed');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_planned_custom_emails' and not tgisinternal),'planned intent trigger is installed');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_practice_custom_emails' and not tgisinternal),'practice intent trigger is installed');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_tournament_lock_custom_emails' and not tgisinternal),'draw-lock intent trigger is installed');

insert into auth.users(id,email,raw_user_meta_data) values
  ('37000000-0000-0000-0000-000000000001','outbox-player@test.invalid','{"first_name":"Outbox","last_name":"Player"}');

insert into public.practice_sessions(id,player_id,activity,minutes,practiced_on)
values('37000000-0000-0000-0000-000000000020','37000000-0000-0000-0000-000000000001','serves',15,(now() at time zone 'Australia/Melbourne')::date);
select is((select count(*) from public.custom_email_outbox where entity_id='37000000-0000-0000-0000-000000000020'),1::bigint,'practice fact and email intent commit through one transaction trigger');
delete from public.custom_email_outbox where entity_id='37000000-0000-0000-0000-000000000020';
delete from public.practice_sessions where id='37000000-0000-0000-0000-000000000020';

set local role service_role;
select ok(public.enqueue_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001',
  'practice_logged','37000000-0000-0000-0000-000000000001','practice',
  '37000000-0000-0000-0000-000000000010'
),'first enqueue creates the intent');
select is((select status from public.custom_email_outbox where kind='practice_logged'),'pending','new intent waits durably');
select ok(not public.enqueue_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001',
  'practice_logged','37000000-0000-0000-0000-000000000001','practice',
  '37000000-0000-0000-0000-000000000010'
),'same context enqueue is idempotent');
select throws_ok($test$
  select public.enqueue_custom_email_v1(
    'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001',
    'practice_logged','37000000-0000-0000-0000-000000000001','match',
    '37000000-0000-0000-0000-000000000010')
$test$,'custom email key belongs to different delivery context','one key cannot be rebound');
select ok((public.claim_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001'
)->>'claimed')::boolean,'pending work is claimed');
select ok((select status='processing' and attempt_count=1 from public.custom_email_outbox where kind='practice_logged'),'claim transition and attempt increment are atomic');
select ok(not (public.claim_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001'
)->>'claimed')::boolean,'a live claim cannot be claimed twice');
select lives_ok($test$
  select public.mark_custom_email_failed_v1(
    'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001','provider 503')
$test$,'claimed work can record a safe failure');
select is((select status from public.custom_email_outbox where kind='practice_logged'),'failed','failed work remains recoverable');
select ok((public.claim_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001'
)->>'claimed')::boolean,'failed work can be reclaimed');
select is((select attempt_count from public.custom_email_outbox where kind='practice_logged'),2,'retry increments the durable attempt count');
select lives_ok($test$
  select public.mark_custom_email_sent_v1(
    'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001','provider-message-1')
$test$,'claimed work can record the provider receipt');
select ok((select status='sent' and provider_message_id='provider-message-1' and sent_at is not null from public.custom_email_outbox where kind='practice_logged'),'sent receipt is complete and terminal');
select ok(not public.supersede_custom_email_v1(
  'practice/logged/37000000-0000-0000-0000-000000000010/37000000-0000-0000-0000-000000000001'
),'a sent provider receipt cannot be superseded');

select ok(public.enqueue_custom_email_v1(
  'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1',
  'tournament_invite','37000000-0000-0000-0000-000000000001','tournament',
  '37000000-0000-0000-0000-000000000030'
),'an invitation generation creates its own intent');
select ok((public.claim_custom_email_v1(
  'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1'
)->>'claimed')::boolean,'invitation delivery can be claimed');
select throws_ok($test$
  select public.supersede_custom_email_v1(
    'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1')
$test$,'custom email delivery is in progress','a live provider claim blocks unsafe generation replacement');
select lives_ok($test$
  select public.mark_custom_email_failed_v1(
    'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1','provider unavailable')
$test$,'an interrupted invitation attempt remains recoverable');
select ok(public.supersede_custom_email_v1(
  'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1'
),'failed work can become terminal when a newer generation replaces it');
select ok((select status='superseded' and superseded_at is not null and last_error is null
  from public.custom_email_outbox where kind='tournament_invite'),'supersession is explicit and auditable');
select ok(not (public.claim_custom_email_v1(
  'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1'
)->>'claimed')::boolean,'superseded work cannot be reclaimed');
select ok(not public.supersede_custom_email_v1(
  'tournament/37000000-0000-0000-0000-000000000030/invite/37000000-0000-0000-0000-000000000001/g1'
),'supersession is idempotent');

reset role;
select is((public.core_backend_health_v3()->'deliveryCounts'->>'sent')::bigint,1::bigint,'health counts the unified sent receipt');
select is((public.core_backend_health_v3()->'deliveryCounts'->>'superseded')::bigint,1::bigint,'health counts terminal supersession separately');
select is(jsonb_array_length(public.core_backend_health_v3()->'actionableDeliveries'),0,'sent custom mail leaves no actionable recovery work');

select * from finish();
rollback;
