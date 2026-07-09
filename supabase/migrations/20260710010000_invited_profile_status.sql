-- Invited players get an `invited` profile, not `active` (ADR-0002, ADR-0009).
--
-- The Phase 2 handle_new_user() (20260709010000) inserted every new auth user's
-- profile as `active`. That is correct for self-signup, but wrong for an admin
-- invite (`inviteUserByEmail`): the invite creates the auth.users row, firing
-- this trigger, so the invitee would be marked `active` before they ever accept.
--
-- Supabase sets auth.users.invited_at when a user is created via invite, so we
-- key off it: invited users start `invited` (with invited_at, no joined_at);
-- self-signups still start `active` (with joined_at) exactly as before. The
-- invited -> active flip stays with ensureActivated() on first authenticated
-- entry (unchanged). This supersedes the profile-status logic in 20260709010000;
-- the on_auth_user_created trigger already points at this function by name.
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
    case when is_invite then 'invited' else 'active' end,
    case when is_invite then now() else null end,
    case when is_invite then null else now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
