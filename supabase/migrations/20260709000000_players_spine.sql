-- Phase 2 spine: players table + RLS.
-- Authoritative model: docs/SCHEMA.md. Decisions: ADR-0002 (Supabase Auth),
-- ADR-0003 (rating_points is a rebuildable cache; schema built in phases).
-- Only the `players` table is created here — matches, tournaments, fixtures,
-- rating_history, etc. land in later phases.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.player_role as enum ('player', 'admin');
create type public.player_status as enum ('invited', 'active', 'inactive');
create type public.plays_hand as enum ('right', 'left');
create type public.backhand_type as enum ('one_handed', 'two_handed');

-- ---------------------------------------------------------------------------
-- players
-- Identity is owned by Supabase Auth (ADR-0002): id references auth.users(id),
-- and there is NO password_hash column — no self-managed passwords.
-- ---------------------------------------------------------------------------
create table public.players (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  first_name   text not null,
  last_name    text not null,
  nickname     text,
  avatar_url   text,
  height_cm    int,
  weight_kg    int,
  plays        public.plays_hand,
  backhand     public.backhand_type,
  game_style   text,
  role         public.player_role   not null default 'player',
  status       public.player_status not null default 'invited',
  invited_at   timestamptz,
  joined_at    timestamptz,
  rating_points int not null default 1000
);

comment on table public.players is
  'App-level profile attached 1:1 to an auth.users row (ADR-0002).';
comment on column public.players.rating_points is
  'Denormalised cache of current Elo points; rebuildable from rating_history, '
  'which is itself rebuildable from match facts (ADR-0001, ADR-0003).';

-- ---------------------------------------------------------------------------
-- Admin check helper.
-- SECURITY DEFINER so it reads players.role without being subject to the RLS
-- policies below (avoids a policy that recursively queries its own table).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--   * any authenticated player may READ all rows
--   * a player may UPDATE only their own row (profile fields only — see trigger)
--   * admins may do anything (insert / update / delete)
-- Postgres combines multiple permissive policies for the same command with OR.
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;

create policy "players_select_all"
  on public.players
  for select
  to authenticated
  using (true);

create policy "players_update_own"
  on public.players
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "players_admin_all"
  on public.players
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard.
-- RLS can gate WHICH rows a player may update, but not WHICH columns. Without
-- this, "edit your own row" would let a player set their own role='admin' or
-- edit rating_points. Non-admins may change profile fields only; privileged
-- columns are frozen and may only change via an admin.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_player_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id           is distinct from old.id
     or new.email        is distinct from old.email
     or new.role         is distinct from old.role
     or new.status       is distinct from old.status
     or new.rating_points is distinct from old.rating_points
     or new.invited_at   is distinct from old.invited_at
     or new.joined_at    is distinct from old.joined_at then
    raise exception
      'players: only admins may change id, email, role, status, rating_points, invited_at, or joined_at';
  end if;

  return new;
end;
$$;

create trigger enforce_player_self_update
  before update on public.players
  for each row
  execute function public.enforce_player_self_update();
