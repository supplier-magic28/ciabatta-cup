-- Fix invited-user creation after the Phase 3c profile-status trigger.
-- PostgreSQL resolves the CASE of two string literals as text, which cannot be
-- inserted into the player_status enum without an explicit cast.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_invite boolean := new.invited_at is not null;
begin
  insert into public.players (id, email, first_name, last_name, status, invited_at, joined_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case
      when is_invite then 'invited'::public.player_status
      else 'active'::public.player_status
    end,
    case when is_invite then now() else null end,
    case when is_invite then null else now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
