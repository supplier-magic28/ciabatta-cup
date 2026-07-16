begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

select has_function('public','is_active_player',array[]::text[],'active actor helper exists');
select has_function('public','player_deletion_blockers_v1',array['uuid'],'deletion eligibility covers all facts');
select has_function('public','submit_practice_v1',array['uuid','practice_activity','integer','date','text'],'idempotent practice submission boundary exists');
select has_function('public','send_tournament_invites_v2',array['uuid','uuid[]','timestamp with time zone'],'safe RSVP send boundary exists');
select has_function('public','respond_to_tournament_invite_v2',array['uuid'],'safe RSVP response boundary exists');
select has_function('public','enqueue_tournament_lifecycle_email_batch_v1',array['uuid','text'],'complete cup lifecycle email batch boundary exists');
select has_function('public','dismiss_untagged_notification_v1',array[]::text[],'notification reconciliation boundary exists');
select has_function('public','install_tournament_stage_v1',array['uuid','text','jsonb'],'atomic stage installer exists');
select has_function('public','finalize_tournament_v1',array['uuid','tournament_completion_path','jsonb'],'atomic tournament finalizer exists');
select has_function('public','core_backend_health_v4',array[]::text[],'extended health boundary exists');
select ok(has_function_privilege('authenticated','public.send_tournament_invites_v1(uuid,uuid[],timestamptz)','execute'),'v1 invite compatibility wrapper remains callable during rollout');
select ok(has_function_privilege('authenticated','public.send_tournament_invites_v2(uuid,uuid[],timestamptz)','execute'),'safe invite v2 is callable');
select ok(has_function_privilege('authenticated','public.submit_practice_v1(uuid,practice_activity,integer,date,text)','execute'),'active members can call practice submission boundary');
select ok(exists(select 1 from pg_trigger where tgname='guard_active_domain_mutation' and tgrelid='public.matches'::regclass and not tgisinternal),'match mutations require an active actor');
select ok(exists(select 1 from pg_trigger where tgname='guard_active_domain_mutation' and tgrelid='public.practice_sessions'::regclass and not tgisinternal),'practice mutations require an active actor');
select is(
  (select count(*) from (values
    ('matches'),('match_sets'),('match_confirmations'),('external_opponents'),
    ('external_match_details'),('play_days'),('practice_sessions'),('planned_matches'),
    ('planned_match_results'),('courts'),('activity_log'),('tournaments'),
    ('tournament_participants'),('fixtures'),('tournament_placements'),
    ('tournament_invites'),('notifications')
  ) expected(table_name)
  where not exists(
    select 1 from pg_trigger trigger_row
    join pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where trigger_row.tgname='guard_active_domain_mutation'
      and not trigger_row.tgisinternal and namespace.nspname='public'
      and relation.relname=expected.table_name
  )),
  0::bigint,
  'every end-user domain table has the active-actor mutation guard'
);
select is(
  (select count(*) from (
    select distinct relation.relname
    from pg_constraint dependency
    join pg_class relation on relation.oid=dependency.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where dependency.contype='f'
      and dependency.confrelid='public.players'::regclass
      and dependency.confdeltype in ('a','r')
      and namespace.nspname='public'
  ) restrictive_dependency
  where strpos(
    pg_get_functiondef('public.player_deletion_blockers_v1(uuid)'::regprocedure),
    restrictive_dependency.relname
  )=0),
  0::bigint,
  'every restrictive player foreign-key dependency is covered by deletion eligibility'
);

insert into auth.users(id,email,raw_user_meta_data) values
  ('71000000-0000-0000-0000-000000000001','active@test.invalid','{"first_name":"Active","last_name":"Player"}'),
  ('71000000-0000-0000-0000-000000000002','invitee@test.invalid','{"first_name":"Invitee","last_name":"Player"}'),
  ('71000000-0000-0000-0000-000000000003','inactive@test.invalid','{"first_name":"Inactive","last_name":"Player"}'),
  ('71000000-0000-0000-0000-000000000004','admin@test.invalid','{"first_name":"Active","last_name":"Admin"}'),
  ('71000000-0000-0000-0000-000000000005','inactive-admin@test.invalid','{"first_name":"Inactive","last_name":"Admin"}'),
  ('71000000-0000-0000-0000-000000000006','wrong-actor@test.invalid','{"first_name":"Wrong","last_name":"Actor"}');
update public.players set status='inactive' where id='71000000-0000-0000-0000-000000000003';
update public.players set role='admin' where id='71000000-0000-0000-0000-000000000004';
update public.players set role='admin',status='inactive' where id='71000000-0000-0000-0000-000000000005';

insert into public.tournaments(id,name,status,starts_at,location_name,courts,created_by,seat_count)
values('72000000-0000-0000-0000-000000000001','Workflow Cup','draft',now()+interval '7 days','Test Court',1,'71000000-0000-0000-0000-000000000004',2);

create temporary table scoring_version_checkpoint as
select fact_version baseline from public.scoring_cache_state where singleton;

insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at)
values(
  '73000000-0000-0000-0000-000000000001','ranked','one_set',
  '71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000001','pending_confirmation',
  '71000000-0000-0000-0000-000000000001','2026-07-01T00:00:00Z'
);
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline from scoring_version_checkpoint),
  'pending match submission does not advance the scoring source version'
);

insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at)
values(
  '73000000-0000-0000-0000-000000000002','exhibition','one_set',
  '71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000001','approved',
  '71000000-0000-0000-0000-000000000001','2026-07-02T00:00:00Z'
);
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+1 from scoring_version_checkpoint),
  'approved ordinary match advances the scoring source version once'
);
update public.matches set location='Scoring Test Court'
where id='73000000-0000-0000-0000-000000000002';
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+1 from scoring_version_checkpoint),
  'court and location metadata do not create false scoring drift'
);

insert into public.tournament_participants(tournament_id,player_id,seed)
values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',1);
insert into public.matches(id,type,format,player1_id,player2_id,winner_id,status,submitted_by,played_at,tournament_id)
values(
  '73000000-0000-0000-0000-000000000003','exhibition','one_set',
  '71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000001','approved',
  '71000000-0000-0000-0000-000000000001','2026-07-03T00:00:00Z',
  '72000000-0000-0000-0000-000000000001'
);
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+1 from scoring_version_checkpoint),
  'approved cup fixtures do not duplicate placement scoring drift'
);

insert into public.practice_sessions(id,player_id,activity,minutes,practiced_on)
values('73000000-0000-0000-0000-000000000004','71000000-0000-0000-0000-000000000001','serves',20,'2026-07-01');
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+1 from scoring_version_checkpoint),
  'pending practice does not advance the scoring source version'
);
update public.practice_sessions
set status='approved',reviewed_by='71000000-0000-0000-0000-000000000004',reviewed_at=now()
where id='73000000-0000-0000-0000-000000000004';
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+2 from scoring_version_checkpoint),
  'approved practice advances the scoring source version once'
);

insert into public.play_days(player_id,played_on)
values('71000000-0000-0000-0000-000000000001','2026-07-02');
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+3 from scoring_version_checkpoint),
  'play-day scoring facts advance the scoring source version'
);
select set_config('app.tournament_completion_rpc','on',true);
insert into public.tournament_placements(tournament_id,player_id,placement,points,awarded_at)
values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',1,100,now());
select set_config('app.tournament_completion_rpc','',true);
select is(
  (select fact_version from public.scoring_cache_state where singleton),
  (select baseline+4 from scoring_version_checkpoint),
  'official placement facts advance the scoring source version'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select ok(public.is_active_player(),'active profile passes the actor boundary');
select ok(not public.is_admin(),'ordinary active player is not an organiser');
create temporary table retried_practice as
select public.submit_practice_v1(
  '74000000-0000-4000-8000-000000000001','wall_hits',25,'2026-07-03','Stable retry test'
) id;
select is(
  public.submit_practice_v1(
    '74000000-0000-4000-8000-000000000001','wall_hits',25,'2026-07-03','Stable retry test'
  ),
  (select id from retried_practice),
  'practice retry returns the original authoritative fact'
);
select is(
  (select count(*) from public.practice_sessions
    where player_id='71000000-0000-0000-0000-000000000001'
      and operation_key='74000000-0000-4000-8000-000000000001'),
  1::bigint,
  'practice retry does not duplicate the practice fact'
);
reset role;
select is(
  (select count(*) from public.custom_email_outbox
    where entity_type='practice' and entity_id=(select id from retried_practice)),
  1::bigint,
  'practice retry reuses the transactionally created email intent'
);
set local role authenticated;

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true);
select ok(not public.is_active_player(),'inactive profile fails the actor boundary');
select throws_ok(
  $$insert into public.practice_sessions(player_id,activity,minutes,practiced_on) values('71000000-0000-0000-0000-000000000003','serves',20,(now() at time zone 'Australia/Melbourne')::date)$$,
  'permission denied for table practice_sessions',
  'direct practice creation is unavailable to authenticated players'
);
select throws_ok(
  $$select public.submit_practice_v1('74000000-0000-4000-8000-000000000002','serves',20,'2026-07-03',null)$$,
  'only active players may submit practice',
  'inactive player cannot use the practice submission boundary'
);

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000005',true);
select ok(not public.is_admin(),'inactive admin has no organiser privilege');
select throws_ok(
  $$select public.configure_tournament_trophy_v1('72000000-0000-0000-0000-000000000001','test','Test Trophy')$$,
  'only organisers may configure cup trophies',
  'inactive admin cannot configure cups'
);

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select public.send_tournament_invites_v2(
    '72000000-0000-0000-0000-000000000001',
    array['71000000-0000-0000-0000-000000000002'::uuid,'71000000-0000-0000-0000-000000000001'::uuid],
    '2099-01-01T00:00:00Z'
  )$$,
  'active organiser can send an RSVP invitation'
);

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
select is(
  (public.respond_to_tournament_invite_v2('72000000-0000-0000-0000-000000000001')).status,
  'accepted'::public.tournament_invite_status,
  'invitee acceptance commits'
);

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select public.send_tournament_invites_v2('72000000-0000-0000-0000-000000000001',array['71000000-0000-0000-0000-000000000002'::uuid],'2099-02-01T00:00:00Z')$$,
  'repeating invite send is safe'
);
select is(
  (select status from public.tournament_invites where tournament_id='72000000-0000-0000-0000-000000000001' and player_id='71000000-0000-0000-0000-000000000002'),
  'accepted'::public.tournament_invite_status,
  'resend never erases accepted RSVP'
);
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
select is(
  (select count(*) from public.notifications where player_id='71000000-0000-0000-0000-000000000002' and kind='tournament_invite'),
  1::bigint,
  'accepted RSVP resend creates no duplicate Zeus card'
);

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000006',true);
select throws_ok(
  $$select public.respond_to_tournament_invite_v2('72000000-0000-0000-0000-000000000001')$$,
  'invitation not found',
  'a different active player cannot answer another invitation'
);
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.respond_to_tournament_invite_v2('72000000-0000-0000-0000-000000000001')$$,
  'only active players may respond',
  'an inactive player cannot answer an invitation'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
update public.tournament_invites
set status='opened',sent_at='2026-06-30T00:00:00Z',opened_at='2026-07-01T00:00:00Z'
where tournament_id='72000000-0000-0000-0000-000000000001'
  and player_id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select public.send_tournament_invites_v2('72000000-0000-0000-0000-000000000001',array['71000000-0000-0000-0000-000000000001'::uuid],'2099-02-01T00:00:00Z')$$,
  'unexpired invitation resend is a delivery-only retry'
);
select ok(
  (select status='opened' and generation=1
      and hold_until='2099-01-01T00:00:00Z'::timestamptz
      and sent_at='2026-06-30T00:00:00Z'::timestamptz
      and opened_at='2026-07-01T00:00:00Z'::timestamptz
    from public.tournament_invites
    where tournament_id='72000000-0000-0000-0000-000000000001'
      and player_id='71000000-0000-0000-0000-000000000001'),
  'delivery retry preserves unexpired RSVP lifecycle facts'
);
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select is(
  (select count(*) from public.notifications
    where player_id='71000000-0000-0000-0000-000000000001' and kind='tournament_invite'),
  1::bigint,
  'delivery retry does not duplicate the Zeus invitation'
);
reset role;
select is(
  (select count(*) from public.custom_email_outbox
    where idempotency_key like 'tournament/72000000-0000-0000-0000-000000000001/invite/71000000-0000-0000-0000-000000000001/%'),
  1::bigint,
  'delivery retry retains one stable email intent generation'
);

reset role;
update public.tournament_invites set status='expired'
where tournament_id='72000000-0000-0000-0000-000000000001'
  and player_id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select public.send_tournament_invites_v2('72000000-0000-0000-0000-000000000001',array['71000000-0000-0000-0000-000000000001'::uuid],'2099-03-01T00:00:00Z')$$,
  'expired RSVP becomes a new invitation generation'
);
select ok(
  (select status='sent' and generation=2
      and hold_until='2099-03-01T00:00:00Z'::timestamptz
      and opened_at is null and accepted_at is null
    from public.tournament_invites
    where tournament_id='72000000-0000-0000-0000-000000000001'
      and player_id='71000000-0000-0000-0000-000000000001'),
  'new generation resets only the expired invitation lifecycle'
);
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select is(
  (select count(*) from public.notifications
    where player_id='71000000-0000-0000-0000-000000000001' and kind='tournament_invite'),
  2::bigint,
  'new invitation generation creates one new deduped Zeus card'
);
reset role;
select is(
  (select count(*) from public.custom_email_outbox
    where idempotency_key like 'tournament/72000000-0000-0000-0000-000000000001/invite/71000000-0000-0000-0000-000000000001/%'),
  2::bigint,
  'new invitation generation preserves audit history and creates a new email intent'
);
select is(
  (select status from public.custom_email_outbox
    where idempotency_key='tournament/72000000-0000-0000-0000-000000000001/invite/71000000-0000-0000-0000-000000000001/g1'),
  'superseded',
  'expired generation is terminal and no longer pollutes recovery health'
);
select is(
  (select status from public.custom_email_outbox
    where idempotency_key='tournament/72000000-0000-0000-0000-000000000001/invite/71000000-0000-0000-0000-000000000001/g2'),
  'pending',
  'new generation owns the only actionable invite delivery'
);

reset role;
update public.tournament_invites set status='sent',hold_until=now()-interval '1 minute'
where tournament_id='72000000-0000-0000-0000-000000000001'
  and player_id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select is(
  (public.respond_to_tournament_invite_v2('72000000-0000-0000-0000-000000000001')).status,
  'expired'::public.tournament_invite_status,
  'expired response preserves the specific expired outcome'
);

reset role;
update public.tournament_invites set status='sent',hold_until='2099-04-01T00:00:00Z'
where tournament_id='72000000-0000-0000-0000-000000000001'
  and player_id='71000000-0000-0000-0000-000000000001';
update public.tournaments set draw_locked_at=now()
where id='72000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.respond_to_tournament_invite_v2('72000000-0000-0000-0000-000000000001')$$,
  'the final field is already locked',
  'locked field preserves the specific locked outcome'
);

reset role;
insert into public.practice_sessions(player_id,activity,minutes,practiced_on)
values('71000000-0000-0000-0000-000000000001','serves',15,(now() at time zone 'Australia/Melbourne')::date);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select ok(
  'practice'=any(public.player_deletion_blockers_v1('71000000-0000-0000-0000-000000000001')),
  'practice facts block hard deletion'
);

select lives_ok('select public.core_backend_health_v4()','active organiser can inspect extended health');

select * from finish();
rollback;
