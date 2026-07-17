-- Allow an active organiser to reopen a locked cup only before the first
-- result. The current fixtures remain as an editable preview; roster/draw RPCs
-- replace them atomically when the organiser saves a revised field.

create or replace function public.guard_locked_tournament_configuration_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.draw_locked_at is not null and (
    new.starts_at is distinct from old.starts_at or new.location_name is distinct from old.location_name or
    new.courts is distinct from old.courts or new.court_id is distinct from old.court_id or
    new.default_surface is distinct from old.default_surface or new.seat_count is distinct from old.seat_count or
    new.group_ruleset is distinct from old.group_ruleset or new.playoff_ruleset is distinct from old.playoff_ruleset or
    new.championship_path is distinct from old.championship_path or new.schedule_locked_at is distinct from old.schedule_locked_at
  ) then raise exception 'the locked draw freezes schedule, roster, formats, and championship path'; end if;
  if old.draw_locked_at is not null and new.draw_locked_at is distinct from old.draw_locked_at
    and coalesce(pg_catalog.current_setting('app.tournament_draw_unlock_rpc',true),'')<>'on'
  then raise exception 'the draw lock can change only through the guarded unlock workflow'; end if;
  return new;
end;
$$;

create or replace function public.unlock_tournament_draw_v1(p_tournament_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_t public.tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'only active organisers may unlock cup draws'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'cup not found'; end if;
  if v_t.draw_locked_at is null then return false; end if;
  if v_t.status<>'scheduled' or v_t.completion_path is not null
    or exists(select 1 from public.matches where tournament_id=v_t.id)
    or exists(select 1 from public.tournament_placements where tournament_id=v_t.id)
  then raise exception 'cup draw has a recorded result and cannot be unlocked'; end if;
  perform pg_catalog.set_config('app.tournament_draw_unlock_rpc','on',true);
  update public.tournaments set draw_locked_at=null,status='draft' where id=v_t.id;
  return true;
end;
$$;

revoke all on function public.unlock_tournament_draw_v1(uuid) from public;
grant execute on function public.unlock_tournament_draw_v1(uuid) to authenticated;
