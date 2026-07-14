alter table public.tournaments
  add column if not exists trophy_key text,
  add column if not exists trophy_name text,
  add constraint tournaments_trophy_pair check ((trophy_key is null)=(trophy_name is null)),
  add constraint tournaments_trophy_key_check check (trophy_key is null or trophy_key ~ '^[a-z0-9_]{1,40}$');

alter table public.notifications add column if not exists tournament_id uuid references public.tournaments(id) on delete cascade;

create table public.tournament_invites (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status public.tournament_invite_status not null default 'sent',
  hold_until timestamptz not null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  accepted_at timestamptz,
  email_sent_at timestamptz,
  primary key(tournament_id,player_id)
);
alter table public.tournament_invites enable row level security;
create policy "tournament_invites_owner_read" on public.tournament_invites for select to authenticated using(player_id=auth.uid() or public.is_admin());
create policy "tournament_invites_admin_update" on public.tournament_invites for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,update on public.tournament_invites to authenticated;

create or replace function public.configure_tournament_trophy_v1(p_tournament_id uuid,p_trophy_key text,p_trophy_name text)
returns void language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'only organisers may configure cup trophies'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.draw_locked_at is not null then raise exception 'cup trophy is frozen'; end if;
  if nullif(btrim(p_trophy_key),'') is null or nullif(btrim(p_trophy_name),'') is null then raise exception 'trophy identity is required'; end if;
  update public.tournaments set trophy_key=btrim(p_trophy_key),trophy_name=btrim(p_trophy_name) where id=p_tournament_id;
end; $$;

create or replace function public.send_tournament_invites_v1(p_tournament_id uuid,p_player_ids uuid[],p_hold_until timestamptz)
returns setof public.tournament_invites language plpgsql security definer set search_path='' as $$
declare v_t public.tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'only organisers may invite players'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.draw_locked_at is not null or v_t.status<>'draft' then raise exception 'cup invitations are closed'; end if;
  if p_hold_until<=now() then raise exception 'invite deadline must be in the future'; end if;
  if cardinality(coalesce(p_player_ids,'{}'::uuid[]))=0 then raise exception 'choose at least one player'; end if;
  if cardinality(p_player_ids)<>cardinality(array(select distinct x from unnest(p_player_ids)x)) then raise exception 'invitees must be unique'; end if;
  if exists(select 1 from unnest(p_player_ids)x left join public.players p on p.id=x where p.id is null or p.status<>'active') then raise exception 'invitees must be active'; end if;
  insert into public.tournament_invites(tournament_id,player_id,status,hold_until,sent_at,opened_at,accepted_at)
  select v_t.id,x,'sent',p_hold_until,now(),null,null from unnest(p_player_ids)x
  on conflict(tournament_id,player_id) do update set status='sent',hold_until=excluded.hold_until,sent_at=now(),opened_at=null,accepted_at=null;
  insert into public.notifications(player_id,kind,tournament_id,target_path,body)
  select x,'tournament_invite',v_t.id,'/tournaments/'||v_t.id,'You have been invited to '||v_t.name||'. 100 points are up for grabs. Respond before the deadline.' from unnest(p_player_ids)x;
  return query select i.* from public.tournament_invites i where i.tournament_id=v_t.id and i.player_id=any(p_player_ids);
end; $$;

create or replace function public.respond_to_tournament_invite_v1(p_tournament_id uuid)
returns public.tournament_invites language plpgsql security definer set search_path='' as $$
declare v_i public.tournament_invites%rowtype;v_t public.tournaments%rowtype;
begin
  select * into v_t from public.tournaments where id=p_tournament_id;
  select * into v_i from public.tournament_invites where tournament_id=p_tournament_id and player_id=auth.uid() for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_i.hold_until<=now() then update public.tournament_invites set status='expired' where tournament_id=p_tournament_id and player_id=auth.uid() returning * into v_i; return v_i; end if;
  if v_t.draw_locked_at is not null then raise exception 'the final field is already locked'; end if;
  update public.tournament_invites set status='accepted',opened_at=coalesce(opened_at,now()),accepted_at=coalesce(accepted_at,now()) where tournament_id=p_tournament_id and player_id=auth.uid() returning * into v_i;
  return v_i;
end; $$;

revoke all on function public.configure_tournament_trophy_v1(uuid,text,text) from public;
revoke all on function public.send_tournament_invites_v1(uuid,uuid[],timestamptz) from public;
revoke all on function public.respond_to_tournament_invite_v1(uuid) from public;
grant execute on function public.configure_tournament_trophy_v1(uuid,text,text) to authenticated;
grant execute on function public.send_tournament_invites_v1(uuid,uuid[],timestamptz) to authenticated;
grant execute on function public.respond_to_tournament_invite_v1(uuid) to authenticated;
