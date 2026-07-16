-- Normalize actor status, scoring-version, RSVP, notification, tournament,
-- and operator-health contracts. This is forward-only: the applied trophy /
-- invite migration remains immutable (ADR-0043).

create or replace function public.is_active_player()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

revoke all on function public.is_active_player() from public;
grant execute on function public.is_active_player() to authenticated;

-- Inactive members retain read access to historical records, but no end-user
-- JWT belonging to an inactive/invited profile may mutate domain state. Trusted
-- backend work has no auth.uid() and remains available for cache/delivery repair.
create or replace function public.guard_active_domain_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_active_player() then
    raise exception 'inactive players have read-only access';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'matches','match_sets','match_confirmations','external_opponents',
    'external_match_details','play_days','practice_sessions','planned_matches',
    'planned_match_results','courts','activity_log','tournaments',
    'tournament_participants','fixtures','tournament_placements',
    'tournament_invites','notifications'
  ] loop
    execute format('drop trigger if exists guard_active_domain_mutation on public.%I', v_table);
    execute format(
      'create trigger guard_active_domain_mutation before insert or update or delete on public.%I for each row execute function public.guard_active_domain_mutation_v1()',
      v_table
    );
  end loop;
end;
$$;

drop policy if exists "players_update_own" on public.players;
create policy "players_update_own"
  on public.players for update to authenticated
  using (auth.uid() = id and status in ('active','invited'))
  with check (auth.uid() = id and status = 'active');

-- Hard deletion is for a genuinely unused identity, not merely a player with
-- no ordinary matches. Return stable blocker labels for the service action.
create or replace function public.player_deletion_blockers_v1(p_player_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blockers text[] := '{}'::text[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only organisers may inspect deletion eligibility';
  end if;
  if p_player_id is null then raise exception 'player is required'; end if;

  if exists(select 1 from public.matches where p_player_id in (player1_id,player2_id,winner_id,submitted_by,admin_logged_by)) then v_blockers:=array_append(v_blockers,'matches'); end if;
  if exists(select 1 from public.practice_sessions where p_player_id in (player_id,reviewed_by)) then v_blockers:=array_append(v_blockers,'practice'); end if;
  if exists(select 1 from public.play_days where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'play_days'); end if;
  if exists(select 1 from public.tournaments where created_by=p_player_id) then v_blockers:=array_append(v_blockers,'tournaments'); end if;
  if exists(select 1 from public.tournament_participants where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'tournament_participation'); end if;
  if exists(select 1 from public.tournament_placements where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'tournament_placements'); end if;
  if exists(select 1 from public.fixtures where p_player_id in (player1_id,player2_id)) then v_blockers:=array_append(v_blockers,'fixtures'); end if;
  if exists(select 1 from public.tournament_invites where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'tournament_invites'); end if;
  if exists(select 1 from public.planned_matches where p_player_id in (created_by,opponent_player_id,cancelled_by)) then v_blockers:=array_append(v_blockers,'planned_matches'); end if;
  if exists(select 1 from public.planned_match_results where p_player_id in (submitted_by,winner_player_id,corrected_by)) then v_blockers:=array_append(v_blockers,'planned_results'); end if;
  if exists(select 1 from public.external_opponents where owner_id=p_player_id) then v_blockers:=array_append(v_blockers,'external_opponents'); end if;
  if exists(select 1 from public.courts where created_by=p_player_id) then v_blockers:=array_append(v_blockers,'courts'); end if;
  if exists(select 1 from public.activity_log where actor_id=p_player_id) then v_blockers:=array_append(v_blockers,'activity_log'); end if;
  if exists(select 1 from public.match_confirmations where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'match_confirmations'); end if;
  if exists(select 1 from public.rating_history where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'rating_history'); end if;
  if exists(select 1 from public.ciabatta_reigns where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'ciabatta_reigns'); end if;
  if exists(select 1 from public.tournament_email_deliveries where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'tournament_email_deliveries'); end if;
  if exists(select 1 from public.lifecycle_email_deliveries where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'lifecycle_email_deliveries'); end if;
  if exists(select 1 from public.custom_email_outbox where player_id=p_player_id) then v_blockers:=array_append(v_blockers,'custom_email_outbox'); end if;
  return v_blockers;
end;
$$;

revoke all on function public.player_deletion_blockers_v1(uuid) from public;
grant execute on function public.player_deletion_blockers_v1(uuid) to authenticated,service_role;

-- Only changes that alter the canonical scoring projection advance the source
-- version. Pending/status-only/metadata writes no longer create false drift.
create or replace function public.bump_scoring_match_version_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean := false;
begin
  if tg_op='INSERT' then
    v_changed := new.status='approved' and new.tournament_id is null;
  elsif tg_op='DELETE' then
    v_changed := old.status='approved' and old.tournament_id is null;
  else
    v_changed := (old.status='approved' and old.tournament_id is null)
        is distinct from (new.status='approved' and new.tournament_id is null)
      or ((old.status='approved' and old.tournament_id is null)
        and (new.status='approved' and new.tournament_id is null) and (
        old.type is distinct from new.type or old.player1_id is distinct from new.player1_id
        or old.player2_id is distinct from new.player2_id or old.winner_id is distinct from new.winner_id
        or old.external_won is distinct from new.external_won or old.played_at is distinct from new.played_at
      ));
  end if;
  if v_changed then update public.scoring_cache_state set fact_version=fact_version+1 where singleton; end if;
  return null;
end;
$$;

create or replace function public.bump_scoring_practice_version_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean := false;
begin
  if tg_op='INSERT' then
    v_changed := new.status='approved';
  elsif tg_op='DELETE' then
    v_changed := old.status='approved';
  else
    v_changed := (old.status='approved') is distinct from (new.status='approved')
      or (old.status='approved' and (
        old.player_id is distinct from new.player_id or old.practiced_on is distinct from new.practiced_on
      ));
  end if;
  if v_changed then update public.scoring_cache_state set fact_version=fact_version+1 where singleton; end if;
  return null;
end;
$$;

drop trigger if exists scoring_version_matches on public.matches;
create trigger scoring_version_matches
after insert or update or delete on public.matches
for each row execute function public.bump_scoring_match_version_v2();

drop trigger if exists scoring_version_practice on public.practice_sessions;
create trigger scoring_version_practice
after insert or update or delete on public.practice_sessions
for each row execute function public.bump_scoring_practice_version_v2();

-- Practice creation now has the same stable retry boundary as match creation.
-- The nullable column keeps the migration compatible with the previously
-- deployed direct-insert application during a rolling release.
alter table public.practice_sessions
  add column if not exists operation_key uuid;
create unique index if not exists practice_sessions_player_operation_key_idx
  on public.practice_sessions(player_id,operation_key)
  where operation_key is not null;

create or replace function public.submit_practice_v1(
  p_operation_key uuid,
  p_activity public.practice_activity,
  p_minutes int,
  p_practiced_on date,
  p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_active_player() then
    raise exception 'only active players may submit practice';
  end if;
  if p_operation_key is null then raise exception 'practice operation key is required'; end if;

  select id into v_id from public.practice_sessions
  where player_id=v_actor and operation_key=p_operation_key;
  if found then return v_id; end if;

  insert into public.practice_sessions(
    player_id,activity,minutes,practiced_on,note,operation_key
  ) values (
    v_actor,p_activity,p_minutes,p_practiced_on,p_note,p_operation_key
  )
  on conflict(player_id,operation_key) where operation_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.practice_sessions
    where player_id=v_actor and operation_key=p_operation_key;
  end if;
  if v_id is null then raise exception 'practice submission could not be resolved'; end if;
  return v_id;
end;
$$;
revoke all on function public.submit_practice_v1(uuid,public.practice_activity,int,date,text) from public;
grant execute on function public.submit_practice_v1(uuid,public.practice_activity,int,date,text) to authenticated;

-- Safe RSVP generations distinguish a new invitation from delivery retry.
alter table public.tournament_invites
  add column if not exists generation int not null default 1 check(generation > 0);

create or replace function public.send_tournament_invites_v2(
  p_tournament_id uuid,p_player_ids uuid[],p_hold_until timestamptz
) returns setof public.tournament_invites
language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_player uuid;
  v_invite public.tournament_invites%rowtype;
  v_new_generation boolean;
begin
  if not public.is_admin() then raise exception 'only active organisers may invite players'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is not null then raise exception 'the final field is already locked'; end if;
  if v_t.status<>'draft' then raise exception 'cup invitations are closed'; end if;
  if p_hold_until is null or p_hold_until<=now() then raise exception 'invite deadline must be in the future'; end if;
  if cardinality(coalesce(p_player_ids,'{}'::uuid[]))=0 then raise exception 'choose at least one player'; end if;
  if cardinality(p_player_ids)<>cardinality(array(select distinct x from unnest(p_player_ids)x)) then raise exception 'invitees must be unique'; end if;
  if exists(select 1 from unnest(p_player_ids)x left join public.players p on p.id=x where p.id is null or p.status<>'active') then raise exception 'invitees must be active'; end if;

  foreach v_player in array p_player_ids loop
    v_new_generation:=false;
    select * into v_invite from public.tournament_invites
      where tournament_id=v_t.id and player_id=v_player for update;
    if not found then
      insert into public.tournament_invites(tournament_id,player_id,status,hold_until,sent_at,generation)
      values(v_t.id,v_player,'sent',p_hold_until,now(),1)
      returning * into v_invite;
      v_new_generation:=true;
    elsif v_invite.status='accepted' then
      -- Acceptance is terminal. Delivery retries operate on the outbox only.
      null;
    elsif v_invite.status='expired' or v_invite.hold_until<=now() then
      -- A genuinely expired offer becomes a new invitation generation.
      -- Ensure legacy generations have an audit row, then terminally supersede
      -- any undelivered work before the replacement generation is created.
      perform public.enqueue_custom_email_v1(
        'tournament/'||v_t.id||'/invite/'||v_player||'/g'||v_invite.generation,
        'tournament_invite',v_player,'tournament',v_t.id
      );
      perform public.supersede_custom_email_v1(
        'tournament/'||v_t.id||'/invite/'||v_player||'/g'||v_invite.generation
      );
      update public.tournament_invites
      set status='sent',hold_until=p_hold_until,sent_at=now(),opened_at=null,
          accepted_at=null,email_sent_at=null,generation=generation+1
      where tournament_id=v_t.id and player_id=v_player
      returning * into v_invite;
      v_new_generation:=true;
    else
      -- Re-sending an unexpired sent/opened RSVP is delivery recovery. Preserve
      -- its deadline, lifecycle timestamps, status, and stable generation.
      null;
    end if;

    if v_invite.status in('sent','opened') then
      if v_new_generation then
      insert into public.notifications(player_id,kind,tournament_id,target_path,body,dedupe_key)
      values(v_player,'tournament_invite',v_t.id,'/tournaments/'||v_t.id,
        'You have been invited to '||v_t.name||'. 100 points are up for grabs. Respond before the deadline.',
        'tournament_invite:'||v_t.id||':'||v_player||':'||v_invite.generation)
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
      end if;

      perform public.enqueue_custom_email_v1(
        'tournament/'||v_t.id||'/invite/'||v_player||'/g'||v_invite.generation,
        'tournament_invite',v_player,'tournament',v_t.id
      );
    end if;
  end loop;

  return query
    select i.* from public.tournament_invites i
    where i.tournament_id=v_t.id and i.player_id=any(p_player_ids)
    order by i.player_id;
end;
$$;

create or replace function public.respond_to_tournament_invite_v2(p_tournament_id uuid)
returns public.tournament_invites
language plpgsql security definer set search_path=''
as $$
declare
  v_i public.tournament_invites%rowtype;
  v_t public.tournaments%rowtype;
begin
  if not public.is_active_player() then raise exception 'only active players may respond'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'cup not found'; end if;
  select * into v_i from public.tournament_invites
    where tournament_id=p_tournament_id and player_id=auth.uid() for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_i.status='accepted' then return v_i; end if;
  if v_i.status='expired' or v_i.hold_until<=now() then
    update public.tournament_invites set status='expired'
      where tournament_id=p_tournament_id and player_id=auth.uid()
      returning * into v_i;
    return v_i;
  end if;
  if v_t.draw_locked_at is not null then raise exception 'the final field is already locked'; end if;
  if v_t.status<>'draft' then raise exception 'cup invitations are closed'; end if;
  update public.tournament_invites
    set status='accepted',opened_at=coalesce(opened_at,now()),accepted_at=coalesce(accepted_at,now())
    where tournament_id=p_tournament_id and player_id=auth.uid()
    returning * into v_i;
  return v_i;
end;
$$;

-- Preserve the deployed v1 signatures during a rolling application release, but
-- route them through the safe implementation so old clients cannot reset an
-- accepted RSVP or duplicate a generation.
create or replace function public.send_tournament_invites_v1(
  p_tournament_id uuid,p_player_ids uuid[],p_hold_until timestamptz
) returns setof public.tournament_invites
language sql security definer set search_path=''
as $$
  select * from public.send_tournament_invites_v2(p_tournament_id,p_player_ids,p_hold_until)
$$;

create or replace function public.respond_to_tournament_invite_v1(p_tournament_id uuid)
returns public.tournament_invites
language sql security definer set search_path=''
as $$
  select public.respond_to_tournament_invite_v2(p_tournament_id)
$$;

revoke all on function public.send_tournament_invites_v1(uuid,uuid[],timestamptz) from public;
revoke all on function public.respond_to_tournament_invite_v1(uuid) from public;
revoke all on function public.send_tournament_invites_v2(uuid,uuid[],timestamptz) from public;
revoke all on function public.respond_to_tournament_invite_v2(uuid) from public;
grant execute on function public.send_tournament_invites_v1(uuid,uuid[],timestamptz) to authenticated;
grant execute on function public.respond_to_tournament_invite_v1(uuid) to authenticated;
grant execute on function public.send_tournament_invites_v2(uuid,uuid[],timestamptz) to authenticated;
grant execute on function public.respond_to_tournament_invite_v2(uuid) to authenticated;

-- A manual lifecycle send first records the complete active-roster intent set
-- atomically. Provider delivery happens only after this transaction commits.
create or replace function public.enqueue_tournament_lifecycle_email_batch_v1(
  p_tournament_id uuid,p_kind text
) returns int
language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_player uuid;
  v_count int := 0;
  v_segment text;
  v_delivery_kind text;
begin
  if not public.is_admin() then raise exception 'only active organisers may send cup email'; end if;
  if p_kind not in('locked_in','game_day') then raise exception 'unsupported cup email kind'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is null then raise exception 'lock the draw before sending cup email'; end if;
  if exists(
    select 1 from public.tournament_participants tp
    join public.players p on p.id=tp.player_id
    where tp.tournament_id=v_t.id and p.status='active'
      and nullif(btrim(p.email),'') is null
  ) then raise exception 'the complete cup email recipient set is unavailable'; end if;

  v_segment:=p_kind;
  v_delivery_kind:=case p_kind when 'locked_in' then 'tournament_locked_in' else 'tournament_game_day' end;
  for v_player in
    select tp.player_id from public.tournament_participants tp
    join public.players p on p.id=tp.player_id and p.status='active'
    where tp.tournament_id=v_t.id order by tp.seed
  loop
    perform public.enqueue_custom_email_v1(
      'tournament/'||v_t.id||'/'||v_segment||'/'||v_player,
      v_delivery_kind,v_player,'tournament',v_t.id
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.enqueue_tournament_lifecycle_email_batch_v1(uuid,text) from public;
grant execute on function public.enqueue_tournament_lifecycle_email_batch_v1(uuid,text) to authenticated;

-- Notification completion is an owner-scoped RPC and rechecks the invariant in
-- the same statement, replacing the retired direct table-update policy.
create or replace function public.dismiss_untagged_notification_v1()
returns int language plpgsql security definer set search_path=''
as $$
declare v_count int;
begin
  if not public.is_active_player() then raise exception 'only active players may dismiss work'; end if;
  if exists(
    select 1 from public.matches
    where status='approved' and auth.uid() in(player1_id,player2_id)
      and (court_id is null or surface is null)
  ) then return 0; end if;
  update public.notifications set read_at=coalesce(read_at,now())
  where player_id=auth.uid() and kind='untagged_matches_nudge' and read_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.dismiss_untagged_notification_v1() from public;
grant execute on function public.dismiss_untagged_notification_v1() to authenticated;

-- Ordinary queried facts ask only their submitter to act. Planned corrections
-- are owned by the planned-result trigger and must not produce a second card.
create or replace function public.notify_match_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind public.notification_kind; v_body text;
begin
  if new.status='pending_confirmation' and new.player2_id is not null and new.tournament_id is null and new.planned_match_id is null
     and (tg_op='INSERT' or old.status='queried') then
    insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
    values(new.player2_id,'match_confirmation_required',new.id,'A match result is waiting for your confirmation.','/matches','match:'||new.id||':confirmation:'||new.updated_at)
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if new.status='pending_approval' and new.tournament_id is null and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(player_id,kind,match_id,planned_match_id,body,target_path,dedupe_key)
    select id,'match_awaiting_admin_approval',new.id,new.planned_match_id,'A ranked match is waiting for organiser approval.','/admin/approvals?kind=matches','match:'||new.id||':admin_approval'
    from public.players where role='admin' and status='active'
    on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status and new.status in ('approved','queried','rejected') then
    v_kind := case new.status when 'approved' then 'match_approved' when 'queried' then 'match_queried' else 'match_rejected' end;
    v_body := case new.status when 'approved' then 'Your match result was approved.' when 'queried' then 'Your match result needs a correction.' else 'Your match result was rejected.' end;
    if new.planned_match_id is null and new.status='queried' then
      insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
      values(new.submitted_by,v_kind,new.id,v_body,'/matches','match:'||new.id||':'||new.status||':'||new.submitted_by)
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    elsif (new.planned_match_id is null and new.status in('approved','rejected')) or (new.planned_match_id is not null and new.status='rejected') then
      insert into public.notifications(player_id,kind,match_id,body,target_path,dedupe_key)
      select recipient,v_kind,new.id,v_body,'/matches','match:'||new.id||':'||new.status||':'||recipient
      from unnest(array[new.player1_id,new.player2_id]) recipient where recipient is not null
      on conflict(player_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- Stage installation is row-locked, validated, and naturally idempotent by
-- tournament + transition. The application may derive pairings but cannot
-- directly mutate fixture/tournament tables anymore.
create or replace function public.install_tournament_stage_v1(
  p_tournament_id uuid,p_transition text,p_fixtures jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_expected int;
begin
  if not public.is_admin() then raise exception 'only active organisers may advance cups'; end if;
  if p_transition not in('tiebreak','semifinal','final_stage') then raise exception 'invalid cup transition'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.status not in('scheduled','live') then raise exception 'cup cannot advance'; end if;
  if jsonb_typeof(p_fixtures)<>'array' or jsonb_array_length(p_fixtures) not between 1 and 2 then raise exception 'invalid championship fixtures'; end if;
  v_expected:=jsonb_array_length(p_fixtures);

  if p_transition='tiebreak' and exists(select 1 from public.fixtures where tournament_id=v_t.id and stage='tiebreak') then return false; end if;
  if p_transition='semifinal' and exists(select 1 from public.fixtures where tournament_id=v_t.id and stage='semifinal') then return false; end if;
  if p_transition='final_stage' and exists(select 1 from public.fixtures where tournament_id=v_t.id and stage in('final','playoff')) then return false; end if;

  if exists(
    select 1 from jsonb_array_elements(p_fixtures)x
    where (x->>'stage') not in('tiebreak','semifinal','final','playoff')
      or (x->>'player1_id')::uuid=(x->>'player2_id')::uuid
      or (x->>'court_number')::int not between 1 and v_t.courts
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player1_id')::uuid)
      or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player2_id')::uuid)
  ) then raise exception 'championship fixtures contain invalid participants'; end if;

  if p_transition='tiebreak' and exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'<>'tiebreak') then raise exception 'invalid tiebreak transition'; end if;
  if p_transition='semifinal' and (v_expected<>2 or exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage'<>'semifinal')) then raise exception 'invalid semifinal transition'; end if;
  if p_transition='final_stage' and exists(select 1 from jsonb_array_elements(p_fixtures)x where x->>'stage' not in('final','playoff')) then raise exception 'invalid final transition'; end if;

  insert into public.fixtures(tournament_id,stage,round_number,slot_number,court_number,ruleset,player1_id,player2_id)
  select v_t.id,(x->>'stage')::public.fixture_stage,(x->>'round_number')::int,
    coalesce((x->>'slot_number')::int,1),(x->>'court_number')::int,v_t.playoff_ruleset,
    (x->>'player1_id')::uuid,(x->>'player2_id')::uuid
  from jsonb_array_elements(p_fixtures)x;
  return true;
end;
$$;

-- Completion and every official placement commit together. The derived cache
-- remains post-commit and reconstructable.
create or replace function public.finalize_tournament_v1(
  p_tournament_id uuid,p_completion_path public.tournament_completion_path,p_placements jsonb
) returns void language plpgsql security definer set search_path=''
as $$
declare
  v_t public.tournaments%rowtype;
  v_count int;
  v_fixture_count int;
  v_result_count int;
  v_final record;
begin
  if not public.is_admin() then raise exception 'only active organisers may complete cups'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.status='completed' then return; end if;
  if v_t.status not in('scheduled','live') then raise exception 'cup cannot complete'; end if;
  if p_completion_path='round_robin' and v_t.championship_path<>'standings' then raise exception 'wrong completion path'; end if;
  if p_completion_path='final_stage' and v_t.championship_path='standings' then raise exception 'wrong completion path'; end if;

  select count(*) into v_fixture_count from public.fixtures where tournament_id=v_t.id and stage='group';
  select count(*) into v_result_count from public.fixtures f join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='group';
  if v_fixture_count=0 or v_result_count<>v_fixture_count then raise exception 'complete every round-robin fixture first'; end if;

  if p_completion_path='final_stage' then
    select m.winner_id,m.player1_id,m.player2_id into v_final
    from public.fixtures f join public.matches m on m.fixture_id=f.id and m.status='approved'
    where f.tournament_id=v_t.id and f.stage='final';
    if not found then raise exception 'complete the final first'; end if;
    if exists(select 1 from public.fixtures f where f.tournament_id=v_t.id and f.stage='playoff')
      and not exists(select 1 from public.fixtures f join public.matches m on m.fixture_id=f.id and m.status='approved' where f.tournament_id=v_t.id and f.stage='playoff')
      then raise exception 'complete the placement match first'; end if;
  end if;

  select count(*) into v_count from public.tournament_participants where tournament_id=v_t.id;
  if jsonb_typeof(p_placements)<>'array' or jsonb_array_length(p_placements)<>v_count then raise exception 'every participant requires a placement'; end if;
  if (select count(distinct (x->>'player_id')::uuid) from jsonb_array_elements(p_placements)x)<>v_count
    or (select count(distinct (x->>'placement')::int) from jsonb_array_elements(p_placements)x)<>v_count
    or exists(select 1 from jsonb_array_elements(p_placements)x
      where (x->>'placement')::int not between 1 and v_count
        or not exists(select 1 from public.tournament_participants p where p.tournament_id=v_t.id and p.player_id=(x->>'player_id')::uuid)
        or (x->>'points')::int<>case (x->>'placement')::int when 1 then 100 when 2 then 50 when 3 then 20 when 4 then 10 else 0 end)
    then raise exception 'placements must be complete, unique, and canonical'; end if;
  if p_completion_path='final_stage' and not exists(select 1 from jsonb_array_elements(p_placements)x where (x->>'placement')::int=1 and (x->>'player_id')::uuid=v_final.winner_id)
    then raise exception 'champion must match the final'; end if;

  insert into public.tournament_placements(tournament_id,player_id,placement,points,awarded_at)
  select v_t.id,(x->>'player_id')::uuid,(x->>'placement')::int,(x->>'points')::int,v_t.starts_at
  from jsonb_array_elements(p_placements)x;

  -- Result-mail intent is authoritative completion state. One intent is
  -- persisted for every official placement, including places five through eight.
  perform public.enqueue_custom_email_v1(
    'tournament/'||v_t.id||'/result_'||
      case (x->>'placement')::int
        when 1 then '1st' when 2 then '2nd' when 3 then '3rd'
        else (x->>'placement')||'th'
      end||'/'||(x->>'player_id'),
    'tournament_result_'||
      case (x->>'placement')::int
        when 1 then '1st' when 2 then '2nd' when 3 then '3rd'
        else (x->>'placement')||'th'
      end,
    (x->>'player_id')::uuid,'tournament',v_t.id
  ) from jsonb_array_elements(p_placements)x;

  update public.tournaments set status='completed',completion_path=p_completion_path where id=v_t.id;
end;
$$;

revoke all on function public.install_tournament_stage_v1(uuid,text,jsonb) from public;
revoke all on function public.finalize_tournament_v1(uuid,public.tournament_completion_path,jsonb) from public;
grant execute on function public.install_tournament_stage_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.finalize_tournament_v1(uuid,public.tournament_completion_path,jsonb) to authenticated;

-- Extend the unified health projection with tournament completion integrity.
create or replace function public.core_backend_health_v4()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_snapshot jsonb;
  v_extra jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'only organisers may inspect backend health'; end if;
  v_snapshot:=public.core_backend_health_v3();
  select coalesce(jsonb_agg(jsonb_build_object('kind','completed_tournament_without_complete_placements','entityId',t.id)),'[]'::jsonb)
  into v_extra
  from public.tournaments t
  where t.status='completed' and (
    select count(*) from public.tournament_placements p where p.tournament_id=t.id
  )<>(
    select count(*) from public.tournament_participants p where p.tournament_id=t.id
  );
  return jsonb_set(v_snapshot,'{integrityIssues}',coalesce(v_snapshot->'integrityIssues','[]'::jsonb)||v_extra,true);
end;
$$;
revoke all on function public.core_backend_health_v4() from public;
grant execute on function public.core_backend_health_v4() to authenticated;
