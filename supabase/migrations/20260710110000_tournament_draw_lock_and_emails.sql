-- Phase 5c: irreversible draw lock and idempotent tournament email delivery.

alter table public.tournaments
  add column if not exists draw_locked_at timestamptz;

create type public.tournament_email_kind as enum ('locked_in', 'game_day');

create table public.tournament_email_deliveries (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  kind public.tournament_email_kind not null,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  provider_message_id text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (tournament_id, player_id, kind)
);

alter table public.tournament_email_deliveries enable row level security;

create policy "tournament_email_deliveries_admin_all"
  on public.tournament_email_deliveries
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.claim_tournament_email_delivery(
  p_tournament_id uuid,
  p_player_id uuid,
  p_kind public.tournament_email_kind
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  if not public.is_admin() then
    raise exception 'only admins may send tournament email';
  end if;
  insert into public.tournament_email_deliveries (
    tournament_id, player_id, kind, status, claimed_at
  ) values (p_tournament_id, p_player_id, p_kind, 'pending', now())
  on conflict (tournament_id, player_id, kind) do update
    set claimed_at = excluded.claimed_at
    where tournament_email_deliveries.status = 'pending'
      and tournament_email_deliveries.claimed_at < now() - interval '10 minutes';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_tournament_email_delivery(uuid, uuid, public.tournament_email_kind) from public;
grant execute on function public.claim_tournament_email_delivery(uuid, uuid, public.tournament_email_kind) to authenticated;

create or replace function public.enforce_tournament_participant_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
begin
  if exists (
    select 1 from public.tournaments
    where id = target_tournament_id and draw_locked_at is not null
  ) then
    raise exception 'tournament participants are locked by the director';
  end if;
  if exists (select 1 from public.matches where tournament_id = target_tournament_id) then
    raise exception 'tournament participants are locked after the first result';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_tournament_fixture_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
begin
  if exists (
    select 1 from public.tournaments
    where id = target_tournament_id and draw_locked_at is not null
  ) and (tg_op <> 'INSERT' or new.stage = 'group') then
    raise exception 'round-robin fixtures are locked by the director';
  end if;
  if exists (select 1 from public.matches where tournament_id = target_tournament_id)
     and (tg_op <> 'INSERT' or new.stage = 'group') then
    raise exception 'round-robin fixtures are locked after the first result';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.lock_tournament_draw(p_tournament_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'only admins may lock a tournament draw';
  end if;
  if (select count(*) from public.tournament_participants where tournament_id = p_tournament_id) <> 4 then
    raise exception 'the draw requires exactly four players';
  end if;
  if not exists (select 1 from public.fixtures where tournament_id = p_tournament_id and stage = 'group') then
    raise exception 'generate the draw before locking it';
  end if;

  update public.tournaments
     set draw_locked_at = coalesce(draw_locked_at, now()), status = 'scheduled'
   where id = p_tournament_id and status in ('draft', 'scheduled')
   returning draw_locked_at into locked_at;

  if locked_at is null then raise exception 'tournament cannot be locked'; end if;
  return locked_at;
end;
$$;

revoke all on function public.lock_tournament_draw(uuid) from public;
grant execute on function public.lock_tournament_draw(uuid) to authenticated;
