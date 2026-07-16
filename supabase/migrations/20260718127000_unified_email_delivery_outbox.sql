-- One durable custom-email intent and delivery contract.
-- Supabase Auth confirmation/invite/recovery mail remains provider-owned and is
-- deliberately outside this table.

create table public.custom_email_outbox (
  idempotency_key text primary key
    check (char_length(idempotency_key) between 1 and 300),
  kind text not null
    check (kind ~ '^[a-z0-9_]{1,80}$'),
  player_id uuid not null references public.players(id) on delete restrict,
  entity_type text not null
    check (entity_type ~ '^[a-z0-9_]{1,60}$'),
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','superseded')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  superseded_at timestamptz,
  check ((status = 'sent') = (sent_at is not null)),
  check ((status = 'superseded') = (superseded_at is not null)),
  check (status <> 'sent' or provider_message_id is not null)
);

create index custom_email_outbox_actionable_idx
  on public.custom_email_outbox(status,updated_at)
  where status in ('pending','processing','failed');
create index custom_email_outbox_entity_idx
  on public.custom_email_outbox(entity_type,entity_id,player_id);

alter table public.custom_email_outbox enable row level security;
grant select,insert,update on public.custom_email_outbox to service_role;

create or replace function public.enqueue_custom_email_v1(
  p_idempotency_key text,
  p_kind text,
  p_player_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_affected int;
begin
  if nullif(btrim(p_idempotency_key),'') is null
     or char_length(p_idempotency_key) > 300
     or p_kind !~ '^[a-z0-9_]{1,80}$'
     or p_entity_type !~ '^[a-z0-9_]{1,60}$'
     or p_player_id is null
     or p_entity_id is null then
    raise exception 'complete custom email delivery context is required';
  end if;
  if not exists(select 1 from public.players where id=p_player_id) then
    raise exception 'custom email recipient is unavailable';
  end if;

  insert into public.custom_email_outbox(
    idempotency_key,kind,player_id,entity_type,entity_id
  ) values (
    p_idempotency_key,p_kind,p_player_id,p_entity_type,p_entity_id
  ) on conflict(idempotency_key) do nothing;
  get diagnostics v_affected=row_count;

  if v_affected=0 and not exists(
    select 1 from public.custom_email_outbox
    where idempotency_key=p_idempotency_key
      and kind=p_kind
      and player_id=p_player_id
      and entity_type=p_entity_type
      and entity_id=p_entity_id
  ) then
    raise exception 'custom email key belongs to different delivery context';
  end if;
  return v_affected=1;
end;
$$;

create or replace function public.claim_custom_email_v1(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.custom_email_outbox%rowtype;
begin
  select * into v_row from public.custom_email_outbox
  where idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'custom email intent not found'; end if;

  if v_row.status='sent' then
    return jsonb_build_object(
      'claimed',false,'status','sent','providerMessageId',v_row.provider_message_id
    );
  end if;
  if v_row.status='superseded' then
    return jsonb_build_object('claimed',false,'status','superseded');
  end if;
  if v_row.status='processing'
     and v_row.claimed_at > now()-interval '15 minutes' then
    return jsonb_build_object('claimed',false,'status','processing');
  end if;

  update public.custom_email_outbox set
    status='processing',attempt_count=attempt_count+1,
    claimed_at=now(),updated_at=now(),last_error=null
  where idempotency_key=p_idempotency_key;
  return jsonb_build_object('claimed',true,'status','processing');
end;
$$;

create or replace function public.supersede_custom_email_v1(p_idempotency_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.custom_email_outbox%rowtype;
begin
  select * into v_row from public.custom_email_outbox
  where idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'custom email intent not found'; end if;
  if v_row.status in ('sent','superseded') then return false; end if;
  if v_row.status='processing'
     and v_row.claimed_at > now()-interval '15 minutes' then
    raise exception 'custom email delivery is in progress';
  end if;

  update public.custom_email_outbox set
    status='superseded',provider_message_id=null,last_error=null,
    sent_at=null,superseded_at=now(),updated_at=now()
  where idempotency_key=p_idempotency_key;
  return true;
end;
$$;

create or replace function public.mark_custom_email_sent_v1(
  p_idempotency_key text,
  p_provider_message_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_provider_message_id),'') is null then
    raise exception 'provider message id is required';
  end if;
  update public.custom_email_outbox set
    status='sent',provider_message_id=p_provider_message_id,
    last_error=null,sent_at=coalesce(sent_at,now()),updated_at=now()
  where idempotency_key=p_idempotency_key and status in ('processing','sent');
  if not found then raise exception 'custom email is not claimed'; end if;
end;
$$;

create or replace function public.mark_custom_email_failed_v1(
  p_idempotency_key text,
  p_last_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.custom_email_outbox set
    status='failed',last_error=left(coalesce(nullif(btrim(p_last_error),''),'Unknown delivery failure'),500),
    provider_message_id=null,sent_at=null,updated_at=now()
  where idempotency_key=p_idempotency_key and status='processing';
  if not found and not exists(
    select 1 from public.custom_email_outbox
    where idempotency_key=p_idempotency_key and status='sent'
  ) then raise exception 'custom email is not claimed'; end if;
end;
$$;

revoke all on function public.enqueue_custom_email_v1(text,text,uuid,text,uuid) from public;
revoke all on function public.claim_custom_email_v1(text) from public;
revoke all on function public.mark_custom_email_sent_v1(text,text) from public;
revoke all on function public.mark_custom_email_failed_v1(text,text) from public;
revoke all on function public.supersede_custom_email_v1(text) from public;
grant execute on function public.enqueue_custom_email_v1(text,text,uuid,text,uuid) to service_role;
grant execute on function public.claim_custom_email_v1(text) to service_role;
grant execute on function public.mark_custom_email_sent_v1(text,text) to service_role;
grant execute on function public.mark_custom_email_failed_v1(text,text) to service_role;
grant execute on function public.supersede_custom_email_v1(text) to service_role;

-- Carry forward useful diagnostics from both superseded ledgers. Rows without a
-- reconstructable entity/recipient context intentionally remain only in their
-- legacy diagnostic table.
insert into public.custom_email_outbox(
  idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,
  provider_message_id,last_error,created_at,updated_at,claimed_at,sent_at
)
select idempotency_key,kind,player_id,entity_type,entity_id,
  case when status='sent' and provider_message_id is not null then 'sent' when status='failed' then 'failed' else 'pending' end,
  attempt_count,provider_message_id,last_error,created_at,updated_at,
  case when status='pending' then updated_at else null end,
  case when status='sent' and provider_message_id is not null then coalesce(sent_at,updated_at) else null end
from public.lifecycle_email_deliveries
where player_id is not null and entity_id is not null
on conflict(idempotency_key) do nothing;

insert into public.custom_email_outbox(
  idempotency_key,kind,player_id,entity_type,entity_id,status,attempt_count,
  provider_message_id,created_at,updated_at,claimed_at,sent_at
)
select 'tournament/'||tournament_id||'/'||kind::text||'/'||player_id,
  case kind::text
    when 'locked_in' then 'tournament_locked_in'
    when 'game_day' then 'tournament_game_day'
    else 'tournament_'||kind::text
  end,
  player_id,'tournament',tournament_id,
  case when status='sent' and provider_message_id is not null then 'sent' else 'pending' end,
  1,provider_message_id,claimed_at,coalesce(sent_at,claimed_at),
  case when status='pending' then claimed_at else null end,
  case when status='sent' and provider_message_id is not null then coalesce(sent_at,claimed_at) else null end
from public.tournament_email_deliveries
on conflict(idempotency_key) do nothing;

-- These triggers write the delivery intent in the same transaction as the
-- authoritative fact. The application only performs reconstructable delivery
-- after commit.
create or replace function public.enqueue_match_custom_emails_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.tournament_id is null and new.planned_match_id is null and new.admin_logged_by is null then
    if new.type='ranked' then
      perform public.enqueue_custom_email_v1('ranked-match/logged/'||new.id||'/'||new.player1_id,'ranked_match_logged',new.player1_id,'match',new.id);
      perform public.enqueue_custom_email_v1('ranked-match/logged/'||new.id||'/'||new.player2_id,'ranked_match_logged',new.player2_id,'match',new.id);
    elsif new.type='unranked_external' then
      perform public.enqueue_custom_email_v1('external-match/'||new.id||'/'||new.player1_id,'external_match_logged',new.player1_id,'match',new.id);
    end if;
  end if;
  return new;
end; $$;
create trigger enqueue_match_custom_emails
after insert on public.matches for each row execute function public.enqueue_match_custom_emails_v1();

create or replace function public.enqueue_planned_custom_emails_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_player uuid;
begin
  if new.status='locked_in' and (tg_op='INSERT' or old.status is distinct from new.status) then
    foreach v_player in array array[new.created_by,new.opponent_player_id] loop
      if v_player is not null then
        perform public.enqueue_custom_email_v1('planned/'||new.id||'/locked/'||v_player,'planned_locked',v_player,'planned_match',new.id);
      end if;
    end loop;
  elsif new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    foreach v_player in array array[new.created_by,new.opponent_player_id] loop
      if v_player is not null then
        perform public.enqueue_custom_email_v1('planned/'||new.id||'/confirmed/'||v_player,'planned_confirmed',v_player,'planned_match',new.id);
      end if;
    end loop;
  end if;
  return new;
end; $$;
create trigger enqueue_planned_custom_emails
after insert or update of status on public.planned_matches
for each row execute function public.enqueue_planned_custom_emails_v1();

create or replace function public.enqueue_practice_custom_emails_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform public.enqueue_custom_email_v1('practice/logged/'||new.id||'/'||new.player_id,'practice_logged',new.player_id,'practice',new.id);
  elsif old.status is distinct from new.status and new.status in ('approved','rejected') then
    perform public.enqueue_custom_email_v1('practice/'||new.status||'/'||new.id||'/'||new.player_id,'practice_'||new.status,new.player_id,'practice',new.id);
  end if;
  return new;
end; $$;
create trigger enqueue_practice_custom_emails
after insert or update of status on public.practice_sessions
for each row execute function public.enqueue_practice_custom_emails_v1();

create or replace function public.enqueue_tournament_lock_custom_emails_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_player uuid;
begin
  if old.draw_locked_at is null and new.draw_locked_at is not null then
    for v_player in
      select tp.player_id
      from public.tournament_participants tp
      join public.players p on p.id=tp.player_id and p.status='active'
      where tp.tournament_id=new.id
    loop
      perform public.enqueue_custom_email_v1('tournament/'||new.id||'/locked_in/'||v_player,'tournament_locked_in',v_player,'tournament',new.id);
    end loop;
  end if;
  return new;
end; $$;
create trigger enqueue_tournament_lock_custom_emails
after update of draw_locked_at on public.tournaments
for each row execute function public.enqueue_tournament_lock_custom_emails_v1();

revoke all on function public.enqueue_match_custom_emails_v1() from public;
revoke all on function public.enqueue_planned_custom_emails_v1() from public;
revoke all on function public.enqueue_practice_custom_emails_v1() from public;
revoke all on function public.enqueue_tournament_lock_custom_emails_v1() from public;

create or replace function public.core_backend_health_v3()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;v_counts jsonb;v_actionable jsonb;v_triggers jsonb;
begin
  v_snapshot:=public.core_backend_health_v2();
  select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) into v_counts
  from (select status,count(*) total from public.custom_email_outbox group by status) counts;
  select coalesce(jsonb_agg(jsonb_build_object(
    'idempotencyKey',idempotency_key,'kind',kind,'playerId',player_id,
    'entityType',entity_type,'entityId',entity_id,'status',status,
    'attemptCount',attempt_count,'lastError',last_error,'updatedAt',updated_at,
    'stale',status='processing' and claimed_at<=now()-interval '15 minutes'
  ) order by updated_at),'[]'::jsonb) into v_actionable
  from public.custom_email_outbox
  where status in ('pending','failed')
     or (status='processing' and claimed_at<=now()-interval '15 minutes');
  select jsonb_build_object(
    'enqueue_match_custom_emails',exists(select 1 from pg_catalog.pg_trigger where tgname='enqueue_match_custom_emails' and not tgisinternal),
    'enqueue_planned_custom_emails',exists(select 1 from pg_catalog.pg_trigger where tgname='enqueue_planned_custom_emails' and not tgisinternal),
    'enqueue_practice_custom_emails',exists(select 1 from pg_catalog.pg_trigger where tgname='enqueue_practice_custom_emails' and not tgisinternal),
    'enqueue_tournament_lock_custom_emails',exists(select 1 from pg_catalog.pg_trigger where tgname='enqueue_tournament_lock_custom_emails' and not tgisinternal)
  ) into v_triggers;
  v_snapshot:=jsonb_set(v_snapshot,'{deliveryCounts}',v_counts,true);
  v_snapshot:=jsonb_set(v_snapshot,'{actionableDeliveries}',v_actionable,true);
  return jsonb_set(v_snapshot,'{infrastructure,triggers}',
    coalesce(v_snapshot->'infrastructure'->'triggers','{}'::jsonb)||v_triggers,true);
end; $$;
revoke all on function public.core_backend_health_v3() from public;
grant execute on function public.core_backend_health_v3() to authenticated;

comment on table public.custom_email_outbox is
  'Reconstructable custom application mail only; Supabase Auth mail is provider-owned.';
comment on function public.core_backend_health_v3() is
  'Adds unified custom-email outbox diagnostics to the organiser health contract.';
