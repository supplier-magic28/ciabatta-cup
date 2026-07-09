-- Fix the admin-bootstrap gap (ADR-0005). The Phase 2 privilege guard
-- enforce_player_self_update() is a TRIGGER, not an RLS policy, so the service
-- role / postgres / SQL editor do NOT bypass it — they only bypass RLS. In
-- those backend contexts there is no end-user JWT, so auth.uid() is null and
-- is_admin() is false, which blocked seeding the very first admin (the flow
-- ADR-0002 assumed would work "via the service role").
--
-- The guard is meant to constrain end-user players, not trusted backend tooling.
-- Exempt any context with no end-user JWT (auth.uid() is null): service role,
-- postgres, and the SQL editor. This is safe — an authenticated end user always
-- has a uid, and anon cannot pass RLS to reach this trigger.
create or replace function public.enforce_player_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins, and trusted backend contexts (no end-user JWT), may change anything.
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  -- Always-frozen columns for non-admin end users.
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
