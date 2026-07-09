-- Phase 2 auth: auto-create a players profile on signup, and allow an invited
-- player to activate themselves. Decisions: ADR-0002 (Supabase Auth),
-- ADR-0004 (auth implementation). Builds on 20260709000000_players_spine.sql.

-- ---------------------------------------------------------------------------
-- handle_new_user: when a new auth.users row is inserted, create the matching
-- public.players profile. Runs as SECURITY DEFINER so it can write players
-- regardless of RLS, and is owned by the auth-user INSERT (not client code).
--
-- first/last name ride along in raw_user_meta_data (set by signUp options.data);
-- the trigger only sees the auth user, so profile fields must come from there.
-- ON CONFLICT DO NOTHING protects a pre-existing invited row created by an
-- admin invite (that row keeps its invited status until the user completes
-- signup and activates).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players (id, email, first_name, last_name, status, joined_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    'active',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Widen the Phase 2 privilege guard: a non-admin still may not touch id, email,
-- role, rating_points, or invited_at — but MAY perform the one-way self
-- transition status invited -> active (setting joined_at), so completing signup
-- can activate their own profile without an admin. Any other status change by a
-- non-admin is still rejected.
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

  -- Always-frozen columns for non-admins.
  if new.id            is distinct from old.id
     or new.email         is distinct from old.email
     or new.role          is distinct from old.role
     or new.rating_points is distinct from old.rating_points
     or new.invited_at    is distinct from old.invited_at then
    raise exception
      'players: only admins may change id, email, role, rating_points, or invited_at';
  end if;

  -- Status may only change as the one-way self-activation invited -> active.
  if new.status is distinct from old.status
     and not (old.status = 'invited' and new.status = 'active') then
    raise exception
      'players: non-admins may only change status from invited to active';
  end if;

  return new;
end;
$$;
