-- Phase 4: organiser-operated round-robin tournaments (ADR-0016).
-- Tournament schedules are mutable operational data. Linked approved matches
-- remain immutable facts and continue to be the only input to Elo.

create type public.tournament_structure as enum ('round_robin', 'knockout', 'groups_knockout');
create type public.tournament_status as enum ('draft', 'scheduled', 'live', 'completed', 'cancelled');
create type public.tournament_ruleset as enum ('short_first_to_3', 'standard_set_tiebreak_6_all');
create type public.fixture_stage as enum ('group', 'tiebreak', 'quarterfinal', 'semifinal', 'final', 'playoff');

create table public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) > 0),
  structure         public.tournament_structure not null default 'round_robin',
  status            public.tournament_status not null default 'draft',
  starts_at         timestamptz not null,
  timezone          text not null default 'Australia/Melbourne',
  location_name     text not null check (length(trim(location_name)) > 0),
  courts            int not null check (courts between 1 and 20),
  counts_as         public.match_type not null default 'ranked',
  group_ruleset     public.tournament_ruleset not null default 'short_first_to_3',
  playoff_ruleset   public.tournament_ruleset not null default 'standard_set_tiebreak_6_all',
  rules_note        text,
  created_by        uuid not null references public.players (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete restrict,
  seed          int not null check (seed > 0),
  entered_at    timestamptz not null default now(),
  primary key (tournament_id, player_id),
  unique (tournament_id, seed)
);

create table public.fixtures (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage         public.fixture_stage not null,
  round_number  int not null check (round_number > 0),
  slot_number   int not null default 1 check (slot_number > 0),
  court_number  int not null check (court_number > 0),
  ruleset       public.tournament_ruleset not null,
  player1_id    uuid not null references public.players (id) on delete restrict,
  player2_id    uuid not null references public.players (id) on delete restrict,
  created_at    timestamptz not null default now(),
  constraint fixtures_distinct_players check (player1_id <> player2_id),
  constraint fixtures_unique_court_slot unique (
    tournament_id, stage, round_number, slot_number, court_number
  )
);

create index fixtures_tournament_round_idx
  on public.fixtures (tournament_id, stage, round_number, slot_number, court_number);

-- The existing player-submission policy still requires auth.uid() to be a
-- participant. Tournament RPCs use submitted_by as the admin recorder, so the
-- broader table check is replaced by that policy-level distinction.
alter table public.matches drop constraint matches_submitter_is_participant;
comment on column public.matches.submitted_by is
  'Player who submitted a casual result, or admin who recorded a tournament result (ADR-0016).';

alter table public.matches
  add constraint matches_tournament_fk foreign key (tournament_id)
    references public.tournaments (id) on delete restrict,
  add constraint matches_fixture_fk foreign key (fixture_id)
    references public.fixtures (id) on delete restrict;

create unique index matches_one_result_per_fixture
  on public.matches (fixture_id) where fixture_id is not null;

create or replace function public.touch_tournaments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.touch_tournaments_updated_at();

create or replace function public.enforce_fixture_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.court_number > (
    select courts from public.tournaments where id = new.tournament_id
  ) then
    raise exception 'fixtures: court number exceeds tournament court count';
  end if;
  if not exists (
    select 1 from public.tournament_participants
    where tournament_id = new.tournament_id and player_id = new.player1_id
  ) or not exists (
    select 1 from public.tournament_participants
    where tournament_id = new.tournament_id and player_id = new.player2_id
  ) then
    raise exception 'fixtures: both players must belong to the tournament';
  end if;
  return new;
end;
$$;

create trigger enforce_fixture_participants
  before insert or update on public.fixtures
  for each row execute function public.enforce_fixture_participants();

create or replace function public.enforce_tournament_participant_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
begin
  if exists (select 1 from public.matches where tournament_id = target_tournament_id) then
    raise exception 'tournament participants are locked after the first result';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger enforce_tournament_participant_lock
  before insert or update or delete on public.tournament_participants
  for each row execute function public.enforce_tournament_participant_lock();

create or replace function public.enforce_tournament_fixture_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
begin
  if exists (select 1 from public.matches where tournament_id = target_tournament_id)
     and (tg_op <> 'INSERT' or new.stage = 'group') then
    raise exception 'round-robin fixtures are locked after the first result';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger enforce_tournament_fixture_lock
  before insert or update or delete on public.fixtures
  for each row execute function public.enforce_tournament_fixture_lock();

create or replace function public.enforce_match_fixture_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture public.fixtures;
begin
  if new.fixture_id is null and new.submitted_by not in (new.player1_id, new.player2_id) then
    raise exception 'matches: casual submitter must be a participant';
  end if;
  if new.fixture_id is null then return new; end if;
  select * into fixture from public.fixtures where id = new.fixture_id;
  if not found
     or new.tournament_id is distinct from fixture.tournament_id
     or not (
       (new.player1_id = fixture.player1_id and new.player2_id = fixture.player2_id)
       or (new.player1_id = fixture.player2_id and new.player2_id = fixture.player1_id)
     ) then
    raise exception 'matches: fixture, tournament, and participants must agree';
  end if;
  if new.submitted_by not in (new.player1_id, new.player2_id)
     and (not public.is_admin() or new.submitted_by is distinct from auth.uid()) then
    raise exception 'matches: only an authenticated admin may record for fixture participants';
  end if;
  return new;
end;
$$;

create trigger enforce_match_fixture_consistency
  before insert or update on public.matches
  for each row execute function public.enforce_match_fixture_consistency();

alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.fixtures enable row level security;

create policy "tournaments_select_all" on public.tournaments
  for select to authenticated using (true);
create policy "tournaments_admin_all" on public.tournaments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tournament_participants_select_all" on public.tournament_participants
  for select to authenticated using (true);
create policy "tournament_participants_admin_all" on public.tournament_participants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "fixtures_select_all" on public.fixtures
  for select to authenticated using (true);
create policy "fixtures_admin_all" on public.fixtures
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.tournament_score_is_valid(
  p_ruleset public.tournament_ruleset,
  p1_games int,
  p2_games int,
  tb1 int,
  tb2 int
)
returns boolean
language sql
immutable
as $$
  select case
    when p_ruleset = 'short_first_to_3' then
      tb1 is null and tb2 is null and (
        (p1_games = 3 and p2_games between 0 and 2)
        or (p2_games = 3 and p1_games between 0 and 2)
      )
    else
      (
        (p1_games = 6 and p2_games between 0 and 4)
        or (p2_games = 6 and p1_games between 0 and 4)
        or (p1_games = 7 and p2_games = 5)
        or (p2_games = 7 and p1_games = 5)
        or (
          p1_games = 7 and p2_games = 6 and tb1 >= 7
          and tb1 - tb2 >= 2 and (tb1 = 7 or tb1 - tb2 = 2)
        )
        or (
          p2_games = 7 and p1_games = 6 and tb2 >= 7
          and tb2 - tb1 >= 2 and (tb2 = 7 or tb2 - tb1 = 2)
        )
      ) and (
        (greatest(p1_games, p2_games) = 7 and least(p1_games, p2_games) = 6)
        or (tb1 is null and tb2 is null)
      )
  end;
$$;

-- Admin-only atomic path: insert an unsealed match, add its set, then approve
-- it. The final UPDATE is allowed by the immutable-fact trigger because the old
-- status is pending_approval; all later writes are blocked as usual.
create or replace function public.record_tournament_result(
  p_fixture_id uuid,
  p_winner_id uuid,
  p_sets jsonb,
  p_played_at timestamptz,
  p_duration_minutes int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture record;
  score record;
  result_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins may record tournament results';
  end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) <> 1 then
    raise exception 'tournament results require exactly one set';
  end if;

  select f.*, t.status as tournament_status, t.counts_as
    into fixture
    from public.fixtures f
    join public.tournaments t on t.id = f.tournament_id
   where f.id = p_fixture_id
   for update of f;

  if not found then raise exception 'fixture not found'; end if;
  if fixture.tournament_status not in ('scheduled', 'live') then
    raise exception 'tournament is not accepting results';
  end if;
  if p_winner_id not in (fixture.player1_id, fixture.player2_id) then
    raise exception 'winner must be a fixture participant';
  end if;
  if exists (select 1 from public.matches where fixture_id = p_fixture_id) then
    raise exception 'fixture already has a result';
  end if;

  select * into score from jsonb_to_record(p_sets -> 0) as payload(
    p1_games int, p2_games int, tiebreak_p1 int, tiebreak_p2 int
  );
  if public.tournament_score_is_valid(
    fixture.ruleset, score.p1_games, score.p2_games, score.tiebreak_p1, score.tiebreak_p2
  ) is not true then
    raise exception 'score does not match the fixture rules';
  end if;
  if (score.p1_games > score.p2_games and p_winner_id <> fixture.player1_id)
     or (score.p2_games > score.p1_games and p_winner_id <> fixture.player2_id) then
    raise exception 'winner does not match the score';
  end if;

  insert into public.matches (
    type, format, format_note, player1_id, player2_id, winner_id, status,
    submitted_by, played_at, duration_minutes, tournament_id, fixture_id
  ) values (
    fixture.counts_as,
    case when fixture.ruleset = 'short_first_to_3'
      then 'custom'::public.match_format else 'one_set'::public.match_format end,
    case when fixture.ruleset = 'short_first_to_3' then 'First to 3 games' else null end,
    fixture.player1_id, fixture.player2_id, p_winner_id, 'pending_approval',
    auth.uid(), coalesce(p_played_at, now()), p_duration_minutes,
    fixture.tournament_id, fixture.id
  ) returning id into result_id;

  insert into public.match_sets (
    match_id, set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2
  ) values (
    result_id, 1, score.p1_games, score.p2_games, score.tiebreak_p1, score.tiebreak_p2
  );

  update public.matches set status = 'approved' where id = result_id;
  update public.tournaments
     set status = 'live'
   where id = fixture.tournament_id and status = 'scheduled';
  return result_id;
end;
$$;

revoke all on function public.record_tournament_result(uuid, uuid, jsonb, timestamptz, int) from public;
grant execute on function public.record_tournament_result(uuid, uuid, jsonb, timestamptz, int) to authenticated;
