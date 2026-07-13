-- Shared courts, per-match surfaces, metadata-only retro tagging, and a real
-- Zeus notification inbox (ADR-0031).
create type public.surface as enum ('hard', 'clay', 'grass', 'synthetic');

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160 and name = btrim(name)),
  created_by uuid references public.players(id) on delete set null,
  merged_into uuid references public.courts(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (merged_into is null or merged_into <> id)
);
create unique index courts_normalized_name_unique on public.courts ((lower(btrim(name))));

alter table public.matches add column court_id uuid references public.courts(id) on delete set null;
alter table public.matches add column surface public.surface;
alter table public.planned_matches add column court_id uuid references public.courts(id) on delete set null;
alter table public.planned_match_results add column court_id uuid references public.courts(id) on delete set null;
alter table public.planned_match_results add column surface public.surface;
alter table public.tournaments add column court_id uuid references public.courts(id) on delete set null;
alter table public.tournaments add column default_surface public.surface;

alter type public.notification_kind add value if not exists 'untagged_matches_nudge';
alter table public.notifications add column target_path text check (target_path is null or target_path ~ '^/[A-Za-z0-9_/?=&.-]*$');
alter table public.notifications add column dedupe_key text;
create unique index notifications_player_dedupe_unique on public.notifications(player_id, dedupe_key) where dedupe_key is not null;

create or replace function public.guard_notification_owner_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and
     (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Players may only update notification read state';
  end if;
  return new;
end;
$$;
create trigger notifications_owner_update_guard before update on public.notifications
for each row execute function public.guard_notification_owner_update();

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.players(id) on delete set null,
  verb text not null,
  match_id uuid references public.matches(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.courts enable row level security;
alter table public.activity_log enable row level security;
create policy "courts_authenticated_select" on public.courts for select to authenticated using (true);
create policy "courts_authenticated_insert" on public.courts for insert to authenticated with check (created_by = auth.uid());
create policy "courts_admin_update" on public.courts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "activity_log_admin_select" on public.activity_log for select to authenticated using (public.is_admin());

-- Resolve names atomically and follow organiser-created aliases.
create or replace function public.resolve_court(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_next uuid;
  v_hops int := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if char_length(v_name) not between 1 and 160 then raise exception 'Court name must be 1 to 160 characters'; end if;

  select id into v_id from public.courts where lower(name) = lower(v_name);
  if v_id is null then
    insert into public.courts(name, created_by) values (v_name, auth.uid())
    on conflict ((lower(btrim(name)))) do update set name = public.courts.name
    returning id into v_id;
  end if;

  loop
    select merged_into into v_next from public.courts where id = v_id;
    exit when v_next is null;
    v_id := v_next;
    v_hops := v_hops + 1;
    if v_hops > 20 then raise exception 'Court merge chain is invalid'; end if;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.resolve_court(text) from public;
grant execute on function public.resolve_court(text) to authenticated;

-- Approved match facts stay frozen except for explicitly non-scoring metadata.
create or replace function public.enforce_match_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'matches: approved matches are immutable facts (ADR-0001) and cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'approved' and
     (to_jsonb(new) - 'court_id' - 'surface' - 'location' - 'updated_at')
       is distinct from
     (to_jsonb(old) - 'court_id' - 'surface' - 'location' - 'updated_at') then
    raise exception 'matches: approved match facts may only change court/surface metadata (ADR-0031)';
  end if;
  return new;
end;
$$;

create or replace function public.guard_reviewed_planned_result_metadata()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' and
     (to_jsonb(new) - 'court_id') is distinct from (to_jsonb(old) - 'court_id') then
    raise exception 'Reviewed result proposals are immutable except for canonical court merges';
  end if;
  return new;
end;
$$;
create trigger planned_results_review_guard before update on public.planned_match_results
for each row execute function public.guard_reviewed_planned_result_metadata();

create or replace function public.tag_match_metadata(p_match_id uuid, p_court_id uuid, p_surface public.surface)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_court public.courts%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if auth.uid() is distinct from v_match.player1_id and auth.uid() is distinct from v_match.player2_id and not public.is_admin() then
    raise exception 'only participants or organisers may tag this match';
  end if;
  if p_court_id is not null then
    select * into v_court from public.courts where id = p_court_id and merged_into is null;
    if not found then raise exception 'choose a canonical court'; end if;
  end if;

  update public.matches
     set court_id = p_court_id,
         surface = p_surface,
         location = case when p_court_id is null then location else v_court.name end
   where id = p_match_id;

  insert into public.activity_log(actor_id, verb, match_id, metadata)
  values (auth.uid(), 'match_surface_tagged', p_match_id,
    jsonb_build_object(
      'court_id', jsonb_build_object('old', v_match.court_id, 'new', p_court_id),
      'surface', jsonb_build_object('old', v_match.surface, 'new', p_surface)
    ));
end;
$$;
revoke all on function public.tag_match_metadata(uuid, uuid, public.surface) from public;
grant execute on function public.tag_match_metadata(uuid, uuid, public.surface) to authenticated;

create or replace function public.merge_courts(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := p_target_id;
  v_next uuid;
  v_hops int := 0;
begin
  if not public.is_admin() then raise exception 'only organisers may merge courts'; end if;
  if p_source_id = p_target_id then raise exception 'choose two different courts'; end if;
  if not exists(select 1 from public.courts where id = p_source_id and merged_into is null) then raise exception 'source court is not canonical'; end if;
  loop
    select merged_into into v_next from public.courts where id = v_target;
    if not found then raise exception 'target court not found'; end if;
    exit when v_next is null;
    v_target := v_next;
    v_hops := v_hops + 1;
    if v_hops > 20 or v_target = p_source_id then raise exception 'court merge would create a cycle'; end if;
  end loop;
  if v_target = p_source_id then raise exception 'court merge would create a cycle'; end if;

  update public.matches set court_id = v_target where court_id = p_source_id;
  update public.planned_matches set court_id = v_target where court_id = p_source_id;
  update public.planned_match_results set court_id = v_target where court_id = p_source_id;
  update public.tournaments set court_id = v_target where court_id = p_source_id;
  update public.courts set merged_into = v_target where id = p_source_id;
end;
$$;
revoke all on function public.merge_courts(uuid, uuid) from public;
grant execute on function public.merge_courts(uuid, uuid) to authenticated;

-- Existing location strings become shared courts. Case-insensitive duplicates
-- collapse while the original display text stays intact on match history.
insert into public.courts(name, created_by)
select distinct on (lower(location_name)) location_name, null
from (
  select btrim(location) as location_name from public.matches where nullif(btrim(location), '') is not null
  union all
  select btrim(location_name) from public.tournaments where nullif(btrim(location_name), '') is not null
  union all
  select btrim(location) from public.planned_matches where nullif(btrim(location), '') is not null
) locations
order by lower(location_name), location_name
on conflict ((lower(btrim(name)))) do nothing;

update public.matches m set court_id = c.id from public.courts c where lower(btrim(m.location)) = lower(c.name) and m.court_id is null;
update public.planned_matches p set court_id = c.id from public.courts c where lower(btrim(p.location)) = lower(c.name) and p.court_id is null;
update public.tournaments t set court_id = c.id from public.courts c where lower(btrim(t.location_name)) = lower(c.name) and t.court_id is null;

-- Tournament result RPCs insert matches later; stamp their venue metadata at
-- insert time without changing fixture scheduling semantics.
create or replace function public.stamp_tournament_match_metadata()
returns trigger language plpgsql as $$
begin
  if new.tournament_id is not null then
    select court_id, default_surface, location_name
      into new.court_id, new.surface, new.location
      from public.tournaments where id = new.tournament_id;
  end if;
  return new;
end;
$$;
create trigger stamp_tournament_match_metadata before insert on public.matches
for each row when (new.tournament_id is not null)
execute function public.stamp_tournament_match_metadata();

comment on table public.courts is 'Shared canonical tennis venues; merged rows remain aliases for historical resolution.';
comment on column public.matches.surface is 'Optional metadata only; retagging never changes score, points, Elo, or approval.';
