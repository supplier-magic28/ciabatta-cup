-- Enforce the RPC-only mutation boundaries after the application has moved to
-- migrations 127-129 (ADR-0043). Keep this as a separate rollout step so the
-- additive database boundary and application can be released before lockdown.

-- Clean projects no longer auto-expose public tables to Data API roles. The
-- server-only service role must be able to reconstruct facts and bootstrap the
-- first organiser, while an invited browser identity needs only the two
-- columns used by its guarded invited -> active transition. RLS plus
-- enforce_player_self_update() remains the row/state boundary.
grant select on all tables in schema public to service_role;
grant update(role) on public.players to service_role;
grant update(status,joined_at) on public.players to authenticated;

-- Practice creation is idempotent only through submit_practice_v1.
drop policy if exists "practice_owner_insert" on public.practice_sessions;
revoke insert on public.practice_sessions from authenticated;

-- RSVP lifecycle rows are read models for clients. Only security-definer RPCs
-- may mutate them; the unified outbox is the delivery receipt authority.
drop policy if exists "tournament_invites_admin_update" on public.tournament_invites;
revoke update on public.tournament_invites from authenticated;

-- Storage mutations follow the same active-member boundary as public-schema
-- mutations while public historical avatar reads remain available.
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
with check (
  bucket_id='avatars' and public.is_active_player()
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);
create policy "avatars_update_own" on storage.objects for update to authenticated
using (
  bucket_id='avatars' and public.is_active_player()
  and (storage.foldername(name))[1]=(select auth.uid()::text)
)
with check (
  bucket_id='avatars' and public.is_active_player()
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);
create policy "avatars_delete_own" on storage.objects for delete to authenticated
using (
  bucket_id='avatars' and public.is_active_player()
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

-- Custom and legacy email ledgers are read-only outside their atomic RPCs.
revoke insert,update,delete on public.custom_email_outbox from service_role;
grant select on public.custom_email_outbox to service_role;
revoke insert,update,delete on public.lifecycle_email_deliveries from service_role,authenticated;
grant select on public.lifecycle_email_deliveries to service_role;
drop policy if exists "tournament_email_deliveries_admin_all" on public.tournament_email_deliveries;
create policy "tournament_email_deliveries_admin_read"
  on public.tournament_email_deliveries for select to authenticated
  using(public.is_admin());
revoke insert,update,delete on public.tournament_email_deliveries from authenticated,service_role;
grant select on public.tournament_email_deliveries to authenticated,service_role;

create or replace function public.claim_tournament_email_delivery(
  p_tournament_id uuid,p_player_id uuid,p_kind public.tournament_email_kind
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'legacy tournament email ledger is read-only; use the custom email outbox';
end;
$$;
revoke all on function public.claim_tournament_email_delivery(uuid,uuid,public.tournament_email_kind)
  from public,authenticated,service_role;

-- Direct stage, placement, and completion writes would split authoritative
-- facts. Transaction-local markers are set only by the validated RPCs.
create or replace function public.guard_tournament_atomic_mutation_v1()
returns trigger language plpgsql set search_path=''
as $$
declare v_stage public.fixture_stage;
begin
  if tg_table_name='fixtures' then
    v_stage:=case when tg_op='DELETE' then old.stage else new.stage end;
    if v_stage<>'group'
      and coalesce(pg_catalog.current_setting('app.tournament_stage_rpc',true),'')<>'on'
    then raise exception 'championship stages are writable only through the atomic stage RPC'; end if;
  elsif tg_table_name='tournament_placements' then
    if coalesce(pg_catalog.current_setting('app.tournament_completion_rpc',true),'')<>'on'
    then raise exception 'tournament placements are writable only through the atomic finalizer'; end if;
  elsif tg_table_name='tournaments' then
    if (new.status='completed' or old.status='completed'
        or new.completion_path is distinct from old.completion_path)
      and coalesce(pg_catalog.current_setting('app.tournament_completion_rpc',true),'')<>'on'
    then raise exception 'tournament completion is writable only through the atomic finalizer'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists guard_atomic_championship_stage on public.fixtures;
create trigger guard_atomic_championship_stage
before insert or update or delete on public.fixtures for each row
execute function public.guard_tournament_atomic_mutation_v1();
drop trigger if exists guard_atomic_tournament_placements on public.tournament_placements;
create trigger guard_atomic_tournament_placements
before insert or update or delete on public.tournament_placements for each row
execute function public.guard_tournament_atomic_mutation_v1();
drop trigger if exists guard_atomic_tournament_completion on public.tournaments;
create trigger guard_atomic_tournament_completion
before update of status,completion_path on public.tournaments for each row
execute function public.guard_tournament_atomic_mutation_v1();
revoke all on function public.guard_tournament_atomic_mutation_v1() from public;

-- Existing broad admin policies must not regain a direct SQL write path on a
-- project with permissive default grants.
revoke insert,update,delete on public.tournaments,public.tournament_participants,
  public.fixtures,public.tournament_placements from authenticated;
