-- Non-Ciabatta opponents: private names, approved external match facts, and
-- an atomic submission path. Public match rows deliberately contain no name.

alter table public.rating_history drop constraint if exists rating_history_points_before_check;
alter table public.rating_history drop constraint if exists rating_history_points_after_check;
alter table public.rating_history add constraint rating_history_points_before_check check (points_before >= 0);
alter table public.rating_history add constraint rating_history_points_after_check check (points_after >= 0);

alter table public.matches alter column player2_id drop not null;
alter table public.matches add column if not exists external_won boolean;
alter table public.matches add column if not exists location text check (
  location is null or char_length(btrim(location)) between 1 and 160
);

alter table public.matches drop constraint if exists matches_distinct_players;
alter table public.matches drop constraint if exists matches_winner_is_participant;
alter table public.matches drop constraint if exists matches_submitter_is_participant;
alter table public.matches drop constraint if exists matches_approved_has_winner;

alter table public.matches add constraint matches_participants_match_type check (
  (type <> 'unranked_external' and player2_id is not null and external_won is null)
  or (type = 'unranked_external' and player2_id is null and external_won is not null)
);
alter table public.matches add constraint matches_distinct_players check (
  player2_id is null or player1_id <> player2_id
);
alter table public.matches add constraint matches_winner_is_participant check (
  (type <> 'unranked_external' and (winner_id is null or winner_id in (player1_id, player2_id)))
  or (type = 'unranked_external' and (winner_id is null or winner_id = player1_id))
);
-- Do not restore matches_submitter_is_participant: ADR-0016 deliberately
-- removed it because tournament facts are recorded by an admin who is not a
-- participant. Existing insert-shape triggers enforce casual/player writes,
-- and log_external_match always records the authenticated owner as player1.
alter table public.matches add constraint matches_approved_has_winner check (
  status <> 'approved'
  or (type = 'unranked_external' and external_won is not null)
  or (type <> 'unranked_external' and winner_id is not null)
);

create table public.external_opponents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index external_opponents_owner_lower_name_idx
  on public.external_opponents (owner_id, lower(btrim(display_name)));
alter table public.external_opponents enable row level security;
create policy "external_opponents_owner_all" on public.external_opponents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.external_match_details (
  match_id uuid primary key references public.matches (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  external_opponent_id uuid references public.external_opponents (id) on delete set null,
  opponent_name text not null check (char_length(btrim(opponent_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.external_match_details enable row level security;
create policy "external_match_details_owner_select" on public.external_match_details
  for select to authenticated using (owner_id = auth.uid());

create or replace function public.log_external_match(
  p_opponent_name text,
  p_save_opponent boolean,
  p_format public.match_format,
  p_format_note text,
  p_external_won boolean,
  p_played_at timestamptz,
  p_location text,
  p_sets jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_name text := btrim(p_opponent_name);
  v_opponent_id uuid;
  v_match_id uuid;
begin
  if v_owner is null or not exists (select 1 from public.players where id = v_owner and status = 'active') then
    raise exception 'An active player is required';
  end if;
  if char_length(v_name) not between 1 and 100 then raise exception 'Opponent name must be 1 to 100 characters'; end if;
  if p_played_at is null then raise exception 'Match date is required'; end if;
  if p_location is not null and char_length(btrim(p_location)) not between 1 and 160 then raise exception 'Location must be 1 to 160 characters'; end if;
  if p_format = 'custom' and nullif(btrim(p_format_note), '') is null then raise exception 'Custom format needs a note'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 7 then raise exception 'Enter 1 to 7 sets'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sets) s(set_number int, p1_games int, p2_games int, tiebreak_p1 int, tiebreak_p2 int)
    where set_number < 1 or p1_games not between 0 and 30 or p2_games not between 0 and 30
      or (tiebreak_p1 is null) <> (tiebreak_p2 is null)
      or coalesce(tiebreak_p1 not between 0 and 99, false) or coalesce(tiebreak_p2 not between 0 and 99, false)
  ) then raise exception 'Invalid set payload'; end if;

  if p_save_opponent then
    insert into public.external_opponents (owner_id, display_name)
    values (v_owner, v_name)
    on conflict do nothing
    returning id into v_opponent_id;
    if v_opponent_id is null then
      select id into v_opponent_id from public.external_opponents
      where owner_id = v_owner and lower(btrim(display_name)) = lower(v_name);
    end if;
  end if;

  insert into public.matches (
    type, format, format_note, player1_id, player2_id, winner_id, external_won,
    status, submitted_by, played_at, location
  ) values (
    'unranked_external', p_format,
    case when p_format = 'custom' then btrim(p_format_note) else null end,
    v_owner, null, case when p_external_won then null else v_owner end, p_external_won,
    'pending_confirmation', v_owner, p_played_at, nullif(btrim(p_location), '')
  ) returning id into v_match_id;

  insert into public.external_match_details (match_id, owner_id, external_opponent_id, opponent_name)
  values (v_match_id, v_owner, v_opponent_id, v_name);

  insert into public.match_sets (match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)
  select v_match_id, s.set_number, s.p1_games, s.p2_games, s.tiebreak_p1, s.tiebreak_p2
  from jsonb_to_recordset(p_sets) s(set_number int, p1_games int, p2_games int, tiebreak_p1 int, tiebreak_p2 int);

  update public.matches set status = 'approved' where id = v_match_id;
  return v_match_id;
end;
$$;

revoke all on function public.log_external_match(text, boolean, public.match_format, text, boolean, timestamptz, text, jsonb) from public;
grant execute on function public.log_external_match(text, boolean, public.match_format, text, boolean, timestamptz, text, jsonb) to authenticated;
