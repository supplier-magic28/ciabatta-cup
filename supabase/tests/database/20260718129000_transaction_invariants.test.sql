begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

select has_function('public','tournament_standings_v1',array['uuid'],'canonical cup standings exist');
select has_function('public','canonical_tournament_placements_v1',array['uuid','tournament_completion_path'],'canonical placements exist');
select has_function('public','replace_tournament_group_draw_v1',array['uuid','jsonb'],'atomic group draw boundary exists');
select has_function('public','replace_tournament_participant_v2',array['uuid','uuid','uuid','jsonb'],'atomic participant replacement exists');
select has_function('public','update_tournament_cover_v1',array['uuid','text','tournament_frame_shape','numeric','numeric','numeric'],'scoped cup cover boundary exists');
select has_function('public','core_backend_health_v5',array[]::text[],'current health projection exists');

select ok(has_table_privilege('authenticated','public.tournaments','select'),'authenticated tournament reads work on a clean stack');
select ok(has_table_privilege('authenticated','public.fixtures','select'),'authenticated fixture reads work on a clean stack');
select ok(has_table_privilege('authenticated','public.tournament_participants','select'),'authenticated roster reads work on a clean stack');
select ok(has_table_privilege('authenticated','public.tournament_placements','select'),'authenticated placement reads work on a clean stack');
select ok(has_table_privilege('authenticated','public.play_days','select'),'authenticated play-day reads work on a clean stack');
select ok(has_table_privilege('authenticated','public.play_days','insert') and has_table_privilege('authenticated','public.play_days','delete'),'play-day owner DML has explicit grants');
select ok(has_column_privilege('authenticated','public.players','nickname','update')
  and has_column_privilege('authenticated','public.players','use_nickname','update')
  and has_column_privilege('authenticated','public.players','avatar_url','update'),'profile columns have least-privilege update grants');
select ok(not has_column_privilege('authenticated','public.players','role','update'),'profile grant cannot change roles');
select ok(not has_table_privilege('authenticated','public.practice_sessions','insert'),'practice creation is RPC-only');
select ok(not has_table_privilege('authenticated','public.tournament_invites','update'),'RSVP mutation is RPC-only');
select ok(not has_table_privilege('service_role','public.custom_email_outbox','insert')
  and not has_table_privilege('service_role','public.custom_email_outbox','update'),'outbox writes are RPC-only');
select ok(has_table_privilege('service_role','public.custom_email_outbox','select'),'service delivery can read the outbox');
select ok(not has_function_privilege('authenticated','public.claim_tournament_email_delivery(uuid,uuid,tournament_email_kind)','execute'),'legacy tournament email claim is retired');
select ok((select with_check like '%is_active_player%'
  from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_insert_own'),
  'avatar insert policy requires an active player');

insert into auth.users(id,email,raw_user_meta_data) values
  ('81000000-0000-0000-0000-000000000001','p1-129@test.invalid','{"first_name":"One","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000002','p2-129@test.invalid','{"first_name":"Two","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000003','p3-129@test.invalid','{"first_name":"Three","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000004','p4-129@test.invalid','{"first_name":"Four","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000005','p5-129@test.invalid','{"first_name":"Five","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000006','p6-129@test.invalid','{"first_name":"Six","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000007','p7-129@test.invalid','{"first_name":"Seven","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000008','p8-129@test.invalid','{"first_name":"Eight","last_name":"Player"}'),
  ('81000000-0000-0000-0000-000000000009','admin-129@test.invalid','{"first_name":"Active","last_name":"Admin"}');
update public.players set role='admin' where id='81000000-0000-0000-0000-000000000009';

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select lives_ok($$update public.players set nickname='Stable' where id='81000000-0000-0000-0000-000000000001'$$,'active member can update an allowed profile column');
select lives_ok($$insert into public.play_days(player_id,played_on) values('81000000-0000-0000-0000-000000000001',(now() at time zone 'Australia/Melbourne')::date)$$,'active member can create today play-day fact');
reset role;
create temporary table play_day_version as select fact_version value from public.scoring_cache_state where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
reset role;
select lives_ok($$update public.play_days set created_at=created_at+interval '1 second' where player_id='81000000-0000-0000-0000-000000000001'$$,'trusted play-day metadata update is accepted');
select is((select fact_version from public.scoring_cache_state where singleton),(select value from play_day_version),'play-day metadata does not create scoring drift');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.submit_practice_v1('82000000-0000-4000-8000-000000000001','serves',20,'2026-07-01','same')$$,'practice operation is accepted');
select throws_ok($$select public.submit_practice_v1('82000000-0000-4000-8000-000000000001','serves',21,'2026-07-01','same')$$,'practice operation key conflicts with another payload','practice retry rejects a different payload');
reset role;

-- Two complete correction cycles create one card per actor per cycle.
insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at)
values('83000000-0000-0000-0000-000000000001','ranked','one_set',
  '81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000001','pending_approval','81000000-0000-0000-0000-000000000001','2026-07-01');
update public.matches set status='queried' where id='83000000-0000-0000-0000-000000000001';
update public.matches set status='pending_confirmation' where id='83000000-0000-0000-0000-000000000001';
update public.matches set status='pending_approval' where id='83000000-0000-0000-0000-000000000001';
update public.matches set status='queried' where id='83000000-0000-0000-0000-000000000001';
select is((select lifecycle_revision from public.matches where id='83000000-0000-0000-0000-000000000001'),4::bigint,'lifecycle revision advances once per status transition');
select is((select count(*) from public.notifications where match_id='83000000-0000-0000-0000-000000000001' and kind='match_awaiting_admin_approval'),2::bigint,'organiser receives one approval card per correction cycle');
select is((select count(*) from public.notifications where match_id='83000000-0000-0000-0000-000000000001' and kind='match_queried'),2::bigint,'submitter receives one queried card per correction cycle');

-- Group-draw generation and participant replacement are atomic and retry-safe.
insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count)
values('84000000-0000-0000-0000-000000000001','Atomic Draw Cup','draft',now()+interval '5 days','Test',1,'81000000-0000-0000-0000-000000000009',2);
insert into public.tournament_participants(tournament_id,player_id,seed) values
  ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',1),
  ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002',2);
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select throws_ok($$select public.replace_tournament_group_draw_v1('84000000-0000-0000-0000-000000000001','[]')$$,'draw must contain every participant pairing once','incomplete group draw is forbidden');
select ok(public.replace_tournament_group_draw_v1('84000000-0000-0000-0000-000000000001',
  '[{"stage":"group","round_number":1,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000002"}]'),'canonical group draw commits');
select ok(not public.replace_tournament_group_draw_v1('84000000-0000-0000-0000-000000000001',
  '[{"stage":"group","round_number":1,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000002"}]'),'exact group-draw retry is idempotent');
select ok(public.replace_tournament_participant_v2('84000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003',
  '[{"stage":"group","round_number":1,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000003"}]'),'participant replacement and draw commit together');
select ok(not public.replace_tournament_participant_v2('84000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003',
  '[{"stage":"group","round_number":1,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000003"}]'),'participant replacement retry preserves fixture identities');
select lives_ok($$select public.update_tournament_cover_v1('84000000-0000-0000-0000-000000000001',null,'wide',1,0,0)$$,'cover metadata uses its scoped RPC');
reset role;

-- RSVP accepts only draft cups; accepted history cannot be reset directly.
insert into public.tournament_invites(tournament_id,player_id,status,hold_until)
values('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','sent','2099-01-01');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.respond_to_tournament_invite_v2('84000000-0000-0000-0000-000000000001')$$,'cup invitations are closed','non-draft unlocked cup cannot accept an RSVP');
reset role;
update public.tournaments set status='draft' where id='84000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select is((public.respond_to_tournament_invite_v2('84000000-0000-0000-0000-000000000001')).status,'accepted'::public.tournament_invite_status,'draft RSVP acceptance commits');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select throws_ok($$update public.tournament_invites set status='sent' where tournament_id='84000000-0000-0000-0000-000000000001' and player_id='81000000-0000-0000-0000-000000000001'$$,'permission denied for table tournament_invites','admin cannot bypass accepted-terminal RSVP RPC');
reset role;

-- Four-player top-two final: stage prerequisites, exact retry identity, canonical
-- placements, result intents, and completion are one transaction.
insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count,championship_path)
values('84000000-0000-0000-0000-000000000002','Finalizer Cup','scheduled',now()+interval '6 days','Test',2,'81000000-0000-0000-0000-000000000009',4,'top_two_final');
insert into public.tournament_participants(tournament_id,player_id,seed)
select '84000000-0000-0000-0000-000000000002',id,seed from (values
  ('81000000-0000-0000-0000-000000000001'::uuid,1),('81000000-0000-0000-0000-000000000002',2),
  ('81000000-0000-0000-0000-000000000003',3),('81000000-0000-0000-0000-000000000004',4))p(id,seed);
insert into public.fixtures(id,tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id) values
  ('85000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002','group',1,1,1,'short_first_to_3','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002'),
  ('85000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000002','group',1,1,2,'short_first_to_3','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004'),
  ('85000000-0000-0000-0000-000000000003','84000000-0000-0000-0000-000000000002','group',2,1,1,'short_first_to_3','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003'),
  ('85000000-0000-0000-0000-000000000004','84000000-0000-0000-0000-000000000002','group',2,1,2,'short_first_to_3','81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000004'),
  ('85000000-0000-0000-0000-000000000005','84000000-0000-0000-0000-000000000002','group',3,1,1,'short_first_to_3','81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000004'),
  ('85000000-0000-0000-0000-000000000006','84000000-0000-0000-0000-000000000002','group',3,1,2,'short_first_to_3','81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003');
insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id,fixture_id)
select ('86000000-0000-0000-0000-'||right('000000000000'||row_number()over(order by f.id),12))::uuid,'ranked','custom',
  f.player1_id,f.player2_id,case f.id
    when '85000000-0000-0000-0000-000000000002' then f.player1_id else f.player1_id end,
  'pending_approval','81000000-0000-0000-0000-000000000009',now(),f.tournament_id,f.id
from public.fixtures f where f.tournament_id='84000000-0000-0000-0000-000000000002';
insert into public.match_sets(match_id,set_number,p1_games,p2_games)
select id,1,3,0 from public.matches where tournament_id='84000000-0000-0000-0000-000000000002';
update public.matches set status='approved' where tournament_id='84000000-0000-0000-0000-000000000002';
update public.tournaments set draw_locked_at=now() where id='84000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select throws_ok($$select public.install_tournament_stage_v1('84000000-0000-0000-0000-000000000002',null,'[]')$$,'invalid cup transition','NULL stage transition is forbidden');
select throws_ok($$select public.install_tournament_stage_v1('84000000-0000-0000-0000-000000000002','final_stage',null)$$,'invalid championship fixtures','NULL stage payload is forbidden');
select ok(public.install_tournament_stage_v1('84000000-0000-0000-0000-000000000002','final_stage',
  '[{"stage":"final","round_number":4,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000002"},{"stage":"playoff","round_number":4,"slot_number":1,"court_number":2,"player1_id":"81000000-0000-0000-0000-000000000003","player2_id":"81000000-0000-0000-0000-000000000004"}]'),'canonical final stage commits');
select ok(not public.install_tournament_stage_v1('84000000-0000-0000-0000-000000000002','final_stage',
  '[{"stage":"final","round_number":4,"slot_number":1,"court_number":1,"player1_id":"81000000-0000-0000-0000-000000000001","player2_id":"81000000-0000-0000-0000-000000000002"},{"stage":"playoff","round_number":4,"slot_number":1,"court_number":2,"player1_id":"81000000-0000-0000-0000-000000000003","player2_id":"81000000-0000-0000-0000-000000000004"}]'),'exact final-stage retry is idempotent');
select throws_ok($$select public.finalize_tournament_v1('84000000-0000-0000-0000-000000000002','final_stage','[]')$$,'complete the final first','completion waits for championship results');
reset role;

insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id,fixture_id)
select case f.stage when 'final' then '86000000-0000-0000-0000-000000000101' else '86000000-0000-0000-0000-000000000102' end::uuid,
  'ranked','one_set',f.player1_id,f.player2_id,f.player2_id,'pending_approval','81000000-0000-0000-0000-000000000009',now(),f.tournament_id,f.id
from public.fixtures f where f.tournament_id='84000000-0000-0000-0000-000000000002' and f.stage in('final','playoff');
insert into public.match_sets(match_id,set_number,p1_games,p2_games)
select id,1,0,6 from public.matches where id in('86000000-0000-0000-0000-000000000101','86000000-0000-0000-0000-000000000102');
update public.matches set status='approved' where id in('86000000-0000-0000-0000-000000000101','86000000-0000-0000-0000-000000000102');
create temporary table finalizer_version as select fact_version value from public.scoring_cache_state where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select throws_ok($$select public.finalize_tournament_v1('84000000-0000-0000-0000-000000000002','final_stage',
  '[{"player_id":"81000000-0000-0000-0000-000000000001","placement":1,"points":100},{"player_id":"81000000-0000-0000-0000-000000000002","placement":2,"points":50},{"player_id":"81000000-0000-0000-0000-000000000004","placement":3,"points":20},{"player_id":"81000000-0000-0000-0000-000000000003","placement":4,"points":10}]')$$,
  'placements do not match authoritative tournament results','client cannot choose a different champion');
select lives_ok($$select public.finalize_tournament_v1('84000000-0000-0000-0000-000000000002','final_stage',
  '[{"player_id":"81000000-0000-0000-0000-000000000002","placement":1,"points":100},{"player_id":"81000000-0000-0000-0000-000000000001","placement":2,"points":50},{"player_id":"81000000-0000-0000-0000-000000000004","placement":3,"points":20},{"player_id":"81000000-0000-0000-0000-000000000003","placement":4,"points":10}]')$$,'canonical completion commits atomically');
reset role;
select is((select status from public.tournaments where id='84000000-0000-0000-0000-000000000002'),'completed'::public.tournament_status,'completion status commits with placements');
select is((select count(*) from public.tournament_placements where tournament_id='84000000-0000-0000-0000-000000000002'),4::bigint,'all four placements persist');
select is((select count(*) from public.custom_email_outbox where entity_id='84000000-0000-0000-0000-000000000002' and kind like 'tournament_result_%'),4::bigint,'every persisted placement receives one email intent');
select is((select fact_version from public.scoring_cache_state where singleton),(select value+1 from finalizer_version),'atomic placement insert advances scoring version once');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select lives_ok($$select public.finalize_tournament_v1('84000000-0000-0000-0000-000000000002','final_stage',
  '[{"player_id":"81000000-0000-0000-0000-000000000002","placement":1,"points":100},{"player_id":"81000000-0000-0000-0000-000000000001","placement":2,"points":50},{"player_id":"81000000-0000-0000-0000-000000000004","placement":3,"points":20},{"player_id":"81000000-0000-0000-0000-000000000003","placement":4,"points":10}]')$$,'exact completed retry is idempotent');
reset role;
select throws_ok($$update public.tournaments set status='live' where id='84000000-0000-0000-0000-000000000002'$$,'tournament completion is writable only through the atomic finalizer','direct completion reversal is blocked even for backend context');

-- Eight-place standings completion proves official mail coverage 1-8 and the
-- rolling compatibility wrapper is safe.
insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count,championship_path)
values('84000000-0000-0000-0000-000000000003','Eight Place Cup','scheduled',now()+interval '7 days','Test',1,'81000000-0000-0000-0000-000000000009',8,'standings');
insert into public.tournament_participants(tournament_id,player_id,seed)
select '84000000-0000-0000-0000-000000000003',id,ordinality
from unnest(array[
  '81000000-0000-0000-0000-000000000001'::uuid,'81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000004',
  '81000000-0000-0000-0000-000000000005','81000000-0000-0000-0000-000000000006','81000000-0000-0000-0000-000000000007','81000000-0000-0000-0000-000000000008']) with ordinality p(id,ordinality);
with pairs as (
  select a.player_id p1,b.player_id p2,row_number()over(order by a.seed,b.seed)::int rn
  from public.tournament_participants a join public.tournament_participants b
    on b.tournament_id=a.tournament_id and a.seed<b.seed
  where a.tournament_id='84000000-0000-0000-0000-000000000003'
)
insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
select '84000000-0000-0000-0000-000000000003','group',rn,1,1,'short_first_to_3',p1,p2 from pairs;
insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id,fixture_id)
select gen_random_uuid(),'ranked','one_set',f.player1_id,f.player2_id,f.player1_id,'pending_approval',
  '81000000-0000-0000-0000-000000000009',now(),f.tournament_id,f.id
from public.fixtures f where f.tournament_id='84000000-0000-0000-0000-000000000003';
insert into public.match_sets(match_id,set_number,p1_games,p2_games)
select id,1,3,0 from public.matches where tournament_id='84000000-0000-0000-0000-000000000003';
update public.matches set status='approved' where tournament_id='84000000-0000-0000-0000-000000000003';
update public.tournaments set draw_locked_at=now() where id='84000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select lives_ok($$select public.complete_tournament_from_standings_v2('84000000-0000-0000-0000-000000000003')$$,'legacy standings caller routes through atomic canonical completion');
reset role;
select is((select count(*) from public.tournament_placements where tournament_id='84000000-0000-0000-0000-000000000003'),8::bigint,'standings completion persists places one through eight');
select is((select count(*) from public.custom_email_outbox where entity_id='84000000-0000-0000-0000-000000000003' and kind like 'tournament_result_%'),8::bigint,'official result mail covers places one through eight');
select ok(exists(select 1 from public.custom_email_outbox where entity_id='84000000-0000-0000-0000-000000000003' and kind='tournament_result_8th'),'eighth-place intent has a stable custom kind');

-- Receipt immutability and populated legacy-ledger reconciliation.
select ok(public.enqueue_custom_email_v1('test/receipt/1','test_delivery','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001'),'test email intent enqueues');
select ok((public.claim_custom_email_v1('test/receipt/1')->>'claimed')::boolean,'email intent claims atomically');
select lives_ok($$select public.mark_custom_email_sent_v1('test/receipt/1','provider-1')$$,'first provider receipt commits');
select lives_ok($$select public.mark_custom_email_sent_v1('test/receipt/1','provider-1')$$,'same provider receipt is idempotent');
select throws_ok($$select public.mark_custom_email_sent_v1('test/receipt/1','provider-2')$$,'sent receipt conflicts with provider message id','different receipt cannot rewrite sent mail');
insert into public.lifecycle_email_deliveries(idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,updated_at)
values('legacy/populated/1','match_submitted','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001','pending',1,now());
select is(public.reconcile_legacy_email_outbox_v1(),1,'populated legacy ledger reconciles one missing intent');
select is((select status from public.custom_email_outbox where idempotency_key='legacy/populated/1'),'processing','recent legacy claim window remains in flight');

insert into public.custom_email_outbox(idempotency_key,kind,player_id,entity_type,entity_id)
values('legacy/conflict/sent','ranked_match_logged','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001');
insert into public.lifecycle_email_deliveries(idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,provider_message_id,updated_at,sent_at)
values('legacy/conflict/sent','ranked_match_logged','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001','sent',2,'legacy-provider-1',now(),now());
select is(public.reconcile_legacy_email_outbox_v1(),1,'legacy sent receipt reconciles an already-created outbox intent');
select ok((select status='sent' and provider_message_id='legacy-provider-1' and sent_at is not null
  from public.custom_email_outbox where idempotency_key='legacy/conflict/sent'),'legacy lifecycle delivery cannot remain actionable after it was sent');

insert into public.custom_email_outbox(idempotency_key,kind,player_id,entity_type,entity_id)
values('legacy/conflict/failed','practice_logged','81000000-0000-0000-0000-000000000001','practice','82000000-0000-4000-8000-000000000001');
insert into public.lifecycle_email_deliveries(idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,last_error,updated_at)
values('legacy/conflict/failed','practice_logged','81000000-0000-0000-0000-000000000001','practice','82000000-0000-4000-8000-000000000001','failed',3,'legacy failure',now());
select is(public.reconcile_legacy_email_outbox_v1(),1,'legacy failed attempt reconciles an already-created outbox intent');
select ok((select status='failed' and attempt_count=3 and last_error='legacy failure'
  from public.custom_email_outbox where idempotency_key='legacy/conflict/failed'),'legacy failure remains recoverable with its diagnostic');

insert into public.custom_email_outbox(idempotency_key,kind,player_id,entity_type,entity_id)
values('tournament/84000000-0000-0000-0000-000000000001/game_day/81000000-0000-0000-0000-000000000001','tournament_game_day','81000000-0000-0000-0000-000000000001','tournament','84000000-0000-0000-0000-000000000001');
insert into public.tournament_email_deliveries(tournament_id,player_id,kind,status,provider_message_id,claimed_at,sent_at)
values('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','game_day','sent','legacy-tournament-provider',now(),now());
select is(public.reconcile_legacy_email_outbox_v1(),1,'legacy tournament receipt reconciles an already-created outbox intent');
select ok((select status='sent' and provider_message_id='legacy-tournament-provider' and sent_at is not null
  from public.custom_email_outbox where idempotency_key='tournament/84000000-0000-0000-0000-000000000001/game_day/81000000-0000-0000-0000-000000000001'),'legacy tournament delivery cannot remain actionable after it was sent');

insert into public.custom_email_outbox(idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,provider_message_id,sent_at)
values('legacy/conflict/already-sent','ranked_match_logged','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001','sent',1,'outbox-provider',now());
insert into public.lifecycle_email_deliveries(idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,provider_message_id,updated_at,sent_at)
values('legacy/conflict/already-sent','ranked_match_logged','81000000-0000-0000-0000-000000000001','match','83000000-0000-0000-0000-000000000001','sent',2,'different-legacy-provider',now(),now());
select is(public.reconcile_legacy_email_outbox_v1(),0,'reconciliation does not rewrite a unified sent receipt');
select is((select provider_message_id from public.custom_email_outbox where idempotency_key='legacy/conflict/already-sent'),'outbox-provider','unified sent receipt remains immutable during legacy reconciliation');

-- Health catches equal-count wrong-player placements, not merely missing rows.
select set_config('app.tournament_completion_rpc','on',true);
update public.tournament_placements set player_id='81000000-0000-0000-0000-000000000005'
where tournament_id='84000000-0000-0000-0000-000000000002' and placement=4;
select set_config('app.tournament_completion_rpc','',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000009',true);
select ok(jsonb_path_exists(public.core_backend_health_v5(),
  '$.integrityIssues[*] ? (@.kind == "completed_tournament_placement_set_mismatch" && @.entityId == "84000000-0000-0000-0000-000000000002")'),
  'health detects equal-count placement participant mismatch');

select * from finish();
rollback;
